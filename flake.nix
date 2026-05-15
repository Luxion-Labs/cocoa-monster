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
      overlays = [
        (final: prev: {
          nodejs = prev.nodejs_22;
        })
      ];
      pkgs = import nixpkgs {inherit system overlays;};
    in {
      devShells.default = pkgs.mkShell {
        nativeBuildInputs = with pkgs; [
          nodejs
          pnpm
          typescript
          just
          overmind
          docker-compose
          alejandra
        ];
      };

      formatter = pkgs.alejandra;
    });
}
