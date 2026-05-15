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

      # The Compact toolchain — `compact` CLI + `compactc` compiler bundled
      # so `compact compile` runs in the offline nix sandbox without the
      # usual `compact update` toolchain-download step. See nix/compact.nix.
      compact = import ./nix/compact.nix {inherit pkgs;};

      # Source filter for the UI bundle: just the bits the build needs.
      # Excludes node_modules, ci/, cypress artifacts, the docker
      # context — anything outside this filter never reaches the
      # buildNpmPackage sandbox, keeping the dep-fetch FOD's hash
      # stable across unrelated edits.
      uiSrc = pkgs.lib.cleanSourceWith {
        src = pkgs.lib.cleanSource ./.;
        filter = path: type: let
          rel = pkgs.lib.removePrefix (toString ./. + "/") (toString path);
        in
          !(pkgs.lib.hasPrefix "node_modules/" rel
            || pkgs.lib.hasPrefix ".direnv/" rel
            || pkgs.lib.hasPrefix ".github/" rel
            || pkgs.lib.hasPrefix ".claude/" rel
            || pkgs.lib.hasPrefix "ci/" rel
            || pkgs.lib.hasPrefix "charts/" rel
            || pkgs.lib.hasPrefix "images/" rel
            || pkgs.lib.hasPrefix "ui/cypress/" rel
            || pkgs.lib.hasPrefix "ui/dist/" rel
            || pkgs.lib.hasPrefix "contract/dist/" rel
            || pkgs.lib.hasPrefix "contract/src/managed/" rel);
      };

      zkParams = import ./nix/zk-params.nix {inherit pkgs;};

      ui-bundle = import ./nix/ui-bundle.nix {
        inherit pkgs compact zkParams;
        src = uiSrc;
        # Re-discover whenever package-lock.json moves: replace with
        # `pkgs.lib.fakeHash`, run `nix build .#ui-bundle`, and paste the
        # `got: sha256-...=` line back here.
        npmDepsHash = "sha256-s0xEn2cFGGx5M2/dKNUYrwTCwdjU6Ef7ist8S7RI3ys=";
      };

      docker-image = import ./nix/docker-image.nix {
        inherit pkgs ui-bundle;
        nginxConf = ./images/cocoa-monster/nginx.conf;
      };

      # Each pipeline step is a shell app so GitHub Actions and local dev
      # invoke it the same way: `nix run .#{compact,typecheck,build,cypress}`.
      # The wrapper's runtimeInputs include the bundled `compact` toolchain
      # so the npm-script's `compact compile` resolves to the offline-
      # capable binary — no `compact update` ever needed in CI.
      compact-wrapper = pkgs.writeShellApplication {
        name = "compact";
        runtimeInputs = [pkgs.nodejs compact];
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
        runtimeInputs = [pkgs.nodejs compact];
        text = ''
          npm --workspace contract run compact
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
        inherit compact ui-bundle docker-image;
        inherit typecheck build cypress;
        default = docker-image;
      };

      apps = {
        compact = flake-utils.lib.mkApp {drv = compact-wrapper;};
        typecheck = flake-utils.lib.mkApp {drv = typecheck;};
        build = flake-utils.lib.mkApp {drv = build;};
        cypress = flake-utils.lib.mkApp {drv = cypress;};
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
          # The bundled compact toolchain — local dev uses the same binary
          # nix builds use, no `compact update` needed.
          compact
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
