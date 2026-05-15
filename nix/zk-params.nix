# Pre-fetched BLS-Midnight ZK setup parameters.
#
# `compact compile` runs the upstream `zkir` tool which, on first
# invocation per circuit size `k`, fetches `bls_midnight_2p<k>` from
# the Midnight S3 fileshare and writes it to
# `$HOME/.cache/midnight/zk-params/`. The nix sandbox blocks outbound
# network so that fetch errors out (`error sending request for url
# ...s3...amazonaws.com/bls_midnight_2p13`); pre-populating the cache
# from FODs sidesteps the runtime download entirely.
#
# Each cocoa.compact circuit's `k` is reported during compile; this
# list must cover every k the contract uses (currently 9, 13, 14 for
# settle/proposeOutcome at k=9, buy at k=13, redeem at k=14).
{pkgs}: let
  base = "https://midnight-s3-fileshare-dev-eu-west-1.s3.eu-west-1.amazonaws.com";

  fetch = name: hash:
    pkgs.fetchurl {
      url = "${base}/${name}";
      inherit hash;
      # `fetchurl` writes to a hashed store path; we want the file
      # under its original name so the post-fetch copy step doesn't
      # need to rename per-entry.
      downloadToTemp = false;
    };
in {
  bls_midnight_2p9 = fetch "bls_midnight_2p9" "sha256-uQCfEJi87//sPEYas6XjoX9+VZnw8Ixw/NxVqJInvL0=";
  bls_midnight_2p13 = fetch "bls_midnight_2p13" "sha256-0zJJEJacTMVBQ7gEW2SeXDpL1ft7j4X+G3cPZAzhyAM=";
  bls_midnight_2p14 = fetch "bls_midnight_2p14" "sha256-/CUwFoheyDDpeAjJ7JILtcq1whr1kDgKbLXrBTjiskQ=";
}
