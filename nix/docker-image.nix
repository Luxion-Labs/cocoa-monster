# Docker image for cocoa-monster: nginx + the static UI bundle.
#
# `dockerTools.buildLayeredImage` produces a docker-load-format tarball
# (one layer per /nix/store path it depends on, plus the synthetic
# layer from extraCommands). Concourse's registry-image resource
# accepts both .tar and .tar.gz — we keep the default gzip compressor
# and the `ci` task gunzips into image/image.tar before the put.
#
# `fakeNss` provides /etc/{passwd,group,nsswitch.conf} so nginx's
# initial setuid syscall finds an `nginx` user when it tries to drop
# from root; without it nginx errors out at startup. `cacert` is
# unused at runtime (no outbound calls from a static SPA) but cheap
# enough to bundle for any future fetch from configmap-mounted env.
{
  pkgs,
  ui-bundle,
  nginxConf,
  imageName ? "cocoa-monster",
  imageTag ? "latest",
}:
pkgs.dockerTools.buildLayeredImage {
  name = imageName;
  tag = imageTag;

  contents = with pkgs; [
    fakeNss
    cacert
    nginx
    bashInteractive # exec'd by nginx for `init_command` etc.; also useful for `kubectl exec` debug
    coreutils
  ];

  extraCommands = ''
    # Writable runtime dirs nginx needs at startup. /tmp is the writable
    # temp path the baked nginx.conf points at (client_body_temp_path,
    # proxy_temp_path, ...). The image layer is read-only, so the
    # process writes only into these dirs at runtime.
    mkdir -p var/log/nginx var/cache/nginx tmp \
             tmp/client_body tmp/proxy tmp/fastcgi tmp/uwsgi tmp/scgi \
             usr/share/nginx/html etc/nginx

    cp -r ${ui-bundle}/. usr/share/nginx/html/

    install -m644 ${nginxConf}                  etc/nginx/nginx.conf
    install -m644 ${pkgs.nginx}/conf/mime.types etc/nginx/mime.types
  '';

  config = {
    Cmd = ["${pkgs.nginx}/bin/nginx" "-c" "/etc/nginx/nginx.conf" "-g" "daemon off;"];
    ExposedPorts = {"80/tcp" = {};};
  };
}
