# Reeborg 3D 서버 운영 설명서

이 문서는 Docker Compose를 이용한 최초 배포, 업데이트, 점검 및 복구 절차를 설명합니다. 실제 서버 주소와 포트는 Git에서 제외되는 `deploy/.env`에만 저장합니다.

## 1. 구성 개요

- Vite 애플리케이션을 Node.js 빌드 단계에서 정적 파일로 만듭니다.
- 최종 컨테이너는 Nginx만 실행합니다.
- `restart: unless-stopped` 정책으로 장애 또는 서버 재부팅 후 자동으로 다시 시작합니다.
- 서버 데이터베이스나 Docker 볼륨은 사용하지 않습니다.

## 2. 사전 준비

서버에 Git, Docker Engine, Docker Compose v2 플러그인이 필요합니다.

```bash
git --version
docker --version
docker compose version
```

Linux 서버에서는 Docker가 부팅 시 자동으로 시작되도록 설정합니다.

```bash
sudo systemctl enable --now docker
```

Docker 명령에 권한 오류가 발생하면 현재 계정에 Docker 사용 권한을 부여한 뒤 다시 로그인합니다.

```bash
sudo usermod -aG docker "$USER"
```

## 3. 최초 배포

### 3.1 저장소 내려받기

```bash
sudo mkdir -p /opt/reeborg-3d
sudo chown "$USER":"$(id -gn)" /opt/reeborg-3d
git clone https://github.com/legojeon/The-Reeborg-was-replaced.git /opt/reeborg-3d
cd /opt/reeborg-3d
```

### 3.2 서버 설정 만들기

예제 파일을 복사하고 소유자만 읽을 수 있도록 권한을 제한합니다.

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
nano deploy/.env
```

`LISTEN_IP`에는 서버에서 서비스할 네트워크 주소를, `APP_PORT`에는 외부에서 접속할 포트를 입력합니다. 실제 값이 들어간 `deploy/.env`는 Git에 추가하지 않습니다.

설정이 Git에서 제외되는지 확인합니다.

```bash
git check-ignore -v deploy/.env
git status --short
```

### 3.3 빌드 및 실행

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
docker compose --env-file deploy/.env -f deploy/compose.yml ps
```

첫 빌드에서는 Node.js와 Nginx 이미지를 내려받기 때문에 시간이 걸릴 수 있습니다.

## 4. 상태 및 접속 확인

### 4.1 컨테이너 상태

```bash
cd /opt/reeborg-3d
docker compose --env-file deploy/.env -f deploy/compose.yml ps
docker compose --env-file deploy/.env -f deploy/compose.yml logs --tail=100 web
```

`STATUS`가 `Up ... (healthy)`로 표시되면 컨테이너 내부 상태 확인을 통과한 것입니다.

### 4.2 HTTP 응답

서버의 비공개 설정을 현재 셸에 불러와 상태 확인 경로를 요청합니다.

```bash
set -a
. deploy/.env
set +a
curl --fail "http://${LISTEN_IP}:${APP_PORT}/healthz"
```

정상이면 `ok`가 출력됩니다. 브라우저에서는 `http://서버주소:포트` 형식으로 접속합니다.

## 5. 새 버전 배포

업데이트 직전 커밋을 임시 파일에 기록하면 문제가 생겼을 때 바로 되돌릴 수 있습니다.

```bash
cd /opt/reeborg-3d
git status --short
git rev-parse HEAD > /tmp/reeborg-previous-commit
git pull --ff-only
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
docker compose --env-file deploy/.env -f deploy/compose.yml ps
docker compose --env-file deploy/.env -f deploy/compose.yml logs --tail=100 web
```

서버 저장소에서는 소스를 직접 수정하지 않습니다. `git status --short`에 결과가 표시된다면 `git pull` 전에 변경 원인을 확인합니다. 정상적인 `deploy/.env`는 Git에서 무시되므로 표시되지 않습니다.

## 6. 시작, 중지 및 재시작

먼저 프로젝트 디렉터리로 이동합니다.

```bash
cd /opt/reeborg-3d
```

서비스 시작 또는 Compose 설정 반영:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml up -d
```

웹 컨테이너 재시작:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml restart web
```

컨테이너를 유지한 채 중지:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml stop
```

컨테이너와 Compose 네트워크 제거:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml down
```

비정상 종료나 서버 재부팅 후에는 `restart: unless-stopped` 정책으로 자동 재시작됩니다. `stop` 또는 `down`으로 직접 중지했다면 `up -d`로 다시 시작해야 합니다.

## 7. 로그 확인

최근 로그를 계속 확인합니다.

```bash
cd /opt/reeborg-3d
docker compose --env-file deploy/.env -f deploy/compose.yml logs -f --tail=200 web
```

`Ctrl+C`를 누르면 로그 확인만 종료되고 컨테이너는 계속 실행됩니다.

## 8. 이전 버전으로 롤백

업데이트 전에 기록한 커밋으로 돌아간 뒤 이미지를 다시 빌드합니다.

```bash
cd /opt/reeborg-3d
cat /tmp/reeborg-previous-commit
git switch --detach "$(cat /tmp/reeborg-previous-commit)"
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
docker compose --env-file deploy/.env -f deploy/compose.yml ps
```

임시 파일이 없다면 최근 커밋 목록에서 정상 동작했던 커밋을 확인한 후 해당 커밋 ID로 전환합니다.

```bash
git log --oneline -10
git switch --detach 커밋ID
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
```

문제가 해결된 새 버전이 준비되면 기본 브랜치로 돌아갑니다.

```bash
git switch main
git pull --ff-only
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
```

## 9. 디스크 정리

사용하지 않는 중간 이미지와 빌드 캐시가 많이 쌓였을 때만 실행합니다.

```bash
docker image prune -f
docker builder prune -f
```

위 명령은 현재 실행 중인 컨테이너와 사용 중인 이미지를 제거하지 않습니다.

## 10. 서버 재부팅 후 확인

재부팅이 필요하다면 먼저 실행합니다.

```bash
sudo reboot
```

서버에 다시 연결된 뒤 자동 재시작 상태를 확인합니다.

```bash
cd /opt/reeborg-3d
docker compose --env-file deploy/.env -f deploy/compose.yml ps
docker compose --env-file deploy/.env -f deploy/compose.yml logs --tail=100 web
```

## 11. 자주 발생하는 문제

### 포트가 이미 사용 중인 경우

`address already in use` 오류가 나오면 포트를 사용하는 프로세스를 확인하거나 `deploy/.env`의 `APP_PORT`를 변경합니다.

```bash
sudo ss -lntp
```

### 컨테이너가 unhealthy인 경우

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml ps
docker compose --env-file deploy/.env -f deploy/compose.yml logs --tail=200 web
docker inspect reeborg-3d-web-1
```

Compose가 만든 컨테이너 이름이 다르면 `docker compose ... ps`에 표시된 이름을 사용합니다.

### 외부 기기에서 접속되지 않는 경우

컨테이너 상태와 HTTP 응답이 정상이라면 서버 방화벽에서 설정한 포트의 TCP 접속이 허용되어 있는지 확인합니다. 방화벽 변경 방법은 서버 운영 정책을 따릅니다.

## 12. 주의사항

- 현재 구성은 HTTP만 제공합니다. 외부 인터넷에 공개할 경우 도메인과 HTTPS 리버스 프록시를 추가합니다.
- 사용자 Python 실행 시 Pyodide를 외부 CDN에서 받으므로 사용자 브라우저에 인터넷 연결이 필요합니다.
- 애플리케이션 상태는 사용자 브라우저에 저장되며 서버 Docker 볼륨에는 저장되지 않습니다.
- `deploy/.env`를 `git add -f`로 강제 추가하거나 운영 로그에 출력하지 않습니다.
