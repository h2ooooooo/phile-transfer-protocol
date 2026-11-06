# Docker Compose

Use this when you control the machine serving the PHP API. Docker is optional; runtime ZIPs, Composer installations and the WordPress plugin do not require it.

The image runs Apache with PHP 8.3. It publishes a loopback HTTP port and mounts the directory you choose outside Apache's document root.

## Configure

From the project root, copy the example:

::: code-group
```sh [macOS / Linux]
cp ptp-server/.env.docker.example ptp-server/.env.docker
```

```powershell [PowerShell]
Copy-Item ptp-server/.env.docker.example ptp-server/.env.docker
```
:::

Edit `ptp-server/.env.docker` before starting:

```dotenv
PTP_USERNAME=operator
PTP_PASSWORD='replace-with-a-long-random-password'
PTP_DATA_PATH=/srv/sites/example/theme
PTP_PORT=8000
```

`PTP_DATA_PATH` is an existing **host** directory. On Windows, use forward slashes, such as `G:/sites/example/theme`, and make sure Docker Desktop can access the drive. Single-quote passwords containing `$` to preserve them literally.

## Start and connect

```sh
npm run docker:build
npm run docker:up
```

`docker:up` starts the service in the background, builds when needed, and waits for its health check. Point the bridge at:

```yaml
apiEndPoint: 'http://127.0.0.1:8000/ptp-server.php'
apiUsername: 'operator'
apiPassword: 'the-password-from-env-docker'
```

This HTTP URL is for a bridge on the same machine. For a remote bridge, place an HTTPS reverse proxy in front of the loopback port and use its HTTPS URL. The Compose files do not provision a public proxy or certificates.

## Daily commands

| Command | Purpose |
| --- | --- |
| `npm run docker:build` | Build the server image |
| `npm run docker:up` | Start in the background and wait for health |
| `npm run docker:logs` | Follow container logs |
| `npm run docker:dev` | Start with live PHP source mounted |
| `npm run docker:down` | Stop and remove the Compose containers/network |

Stopping the service does not remove files from the host directory.

## Develop without rebuilding

```sh
npm run docker:dev
```

The development override mounts `ptp-server/src` read-only into Apache. Save a PHP file and make another request. No rebuild or container restart is needed for source changes.

The regular configuration copies source into the image. Use `docker:up` again after changing source to rebuild that image.

## Permissions and boundaries

The host directory is mounted read/write at `/srv/ptp`. Apache workers use `www-data`, UID 33 on Linux. Grant that user the needed access through ownership or ACLs. The container cannot fix arbitrary host filesystem permissions for you.

The data directory is outside `/var/www/html`, so uploaded PHP is not served as code by this container. An unrelated web server may still execute those files if you also use that directory for a live site.

The health check calls `hello`. It confirms startup and valid configuration, but does not verify authentication or write access. Test a small file transfer after setup.

## Without npm

The npm scripts are convenience wrappers; Docker itself does not require Node.js:

```sh
docker compose --env-file ptp-server/.env.docker -f ptp-server/compose.yaml up -d --build --wait
docker compose --env-file ptp-server/.env.docker -f ptp-server/compose.yaml logs -f
docker compose --env-file ptp-server/.env.docker -f ptp-server/compose.yaml down
```

For development, add `-f ptp-server/compose.dev.yaml` after the base Compose file. See Docker's [environment variable guide](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/) for the underlying behavior.
