{
  description = "cocoa.monster — privacy-first prediction markets on Midnight";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {
        inherit system;
        overlays = [(final: prev: {nodejs = prev.nodejs_22;})];
      };

      # Each pipeline step is a shell app so GitHub Actions and local dev
      # invoke it the same way: `nix run .#{compact,typecheck,build,cypress}`.
      # The Compact compiler isn't in nixpkgs — CI installs it via
      # .github/actions/setup-compact, and writeShellApplication prepends
      # runtimeInputs to the inherited PATH so the shipped `compact` binary
      # at $HOME/.local/bin remains reachable.
      compact = pkgs.writeShellApplication {
        name = "compact";
        runtimeInputs = [pkgs.nodejs];
        text = ''
          npm --workspace contract run compact
          # Surface the generated layout so import paths can be diagnosed
          # if the toolchain version changes the output extension/shape.
          find contract/src/managed -maxdepth 3 -type f | head -20
        '';
      };

      typecheck = pkgs.writeShellApplication {
        name = "typecheck";
        runtimeInputs = [pkgs.nodejs];
        text = ''
          npm --workspace contract run typecheck
          npm --workspace ui run typecheck
        '';
      };

      build = pkgs.writeShellApplication {
        name = "build";
        runtimeInputs = [pkgs.nodejs];
        text = ''
          npm --workspace contract run build
          npm --workspace ui run build
        '';
      };

      cypress = pkgs.writeShellApplication {
        name = "cypress";
        runtimeInputs = [pkgs.nodejs pkgs.curl];
        text = ''
          npm --workspace ui run preview &
          PREVIEW_PID=$!
          trap 'kill -TERM "$PREVIEW_PID" 2>/dev/null || true' EXIT
          for _ in $(seq 1 60); do
            if curl -fsS http://localhost:4173 >/dev/null 2>&1; then
              break
            fi
            sleep 1
          done
          npm --workspace ui run e2e
        '';
      };

      # Local convenience wrapper: `nix run .#docker-image` builds with
      # the same Dockerfile path the Concourse oci-build-task consumes,
      # so a manual rebuild reproduces what the pipeline ships.
      docker-image = pkgs.writeShellApplication {
        name = "docker-image";
        runtimeInputs = [pkgs.docker];
        text = ''
          docker build -f images/cocoa-monster/Dockerfile -t cocoa-monster .
        '';
      };

      # `fly` is the Concourse CLI used by ci/repipe to push pipeline
      # changes. Pulled directly from the home Concourse so the binary
      # version matches the server's API exactly — a mismatched fly
      # drops confusing "newer fly version available" warnings on every
      # call.
      fly = pkgs.stdenv.mkDerivation {
        pname = "fly";
        version = "home";
        src = pkgs.fetchurl {
          url = "https://ci.home.sandipan.dev/api/v1/cli?arch=${
            if pkgs.stdenv.hostPlatform.isAarch64
            then "arm64"
            else "amd64"
          }&platform=${
            if pkgs.stdenv.isDarwin
            then "darwin"
            else "linux"
          }";
          sha256 = "sha256-3hNH0c1tBPkelpilHDgKcAZu3DIsJlP+yKjieEB6U/o=";
        };
        dontUnpack = true;
        installPhase = ''
          mkdir -p $out/bin
          install -m755 $src $out/bin/fly
        '';
      };
    in {
      packages = {
        inherit compact typecheck build cypress docker-image;
      };

      apps = {
        compact = flake-utils.lib.mkApp {drv = compact;};
        typecheck = flake-utils.lib.mkApp {drv = typecheck;};
        build = flake-utils.lib.mkApp {drv = build;};
        cypress = flake-utils.lib.mkApp {drv = cypress;};
        docker-image = flake-utils.lib.mkApp {drv = docker-image;};
      };

      devShells.default = pkgs.mkShell {
        nativeBuildInputs = with pkgs; [
          nodejs
          pnpm
          typescript
          just
          overmind
          docker-compose
          curl
          alejandra
          # Concourse + chart toolchain — `fly` (above) for repipe, `ytt`
          # for the pipeline templating in ci/, `kubernetes-helm` for
          # chart lint / dep-update / template, `git-cliff` for local
          # release-note previews, `jq`/`yq-go` for the
          # bump-in-deployments yq calls, and `kubectl` for poking
          # namespaces during testflight debug.
          fly
          ytt
          kubernetes-helm
          git-cliff
          jq
          yq-go
          kubectl
        ];
      };

      formatter = pkgs.alejandra;
    });
}
