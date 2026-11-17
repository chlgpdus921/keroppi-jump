# Keroppi Jump Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 `frontend/index.html` 픽셀아트 플랫포머 "KEROPPI JUMP"를 만들고 CDK로 S3 + CloudFront에 배포한다.

**Architecture:** 하나의 `<script>` 안에 고정 스텝(1/60s) 누적 루프, 키 상태 입력, 축 분리 AABB 물리, 문자열 타일맵, X/Y 클램프 카메라를 둔다. 렌더는 640x360 캔버스에 `fillRect`로 직접 그리고 CSS로 정수배 확대. 배포는 비공개 S3 + CloudFront OAC + `BucketDeployment`.

**Tech Stack:** HTML5 Canvas, vanilla JS (ES2020, 외부 라이브러리 없음), AWS CDK v2 (TypeScript, aws-cdk-lib 2.275).

**Spec:** `docs/superpowers/specs/2026-11-17-keroppi-jump-design.md`

## Global Constraints

- 파일: 게임 전체가 `frontend/index.html` 하나. 외부 스크립트·폰트·이미지 금지.
- 캔버스 논리 해상도 640x360, CSS `image-rendering: pixelated`, `ctx.imageSmoothingEnabled = false`.
- 루프는 `requestAnimationFrame`, 물리는 고정 `STEP = 1/60`.
- 타일 `TILE = 16`. 맵 문자: `X` 지형, `C` 코인, `^` 가시, `F` 깃발, `S` 시작점, `.` 빈칸.
- `CLAWD` 배열과 `PALETTE`는 스펙/사용자 메시지의 값을 글자 그대로 복사. 셀 `PX = 3` → 36x33px, `.`은 투명.
- 조작: ArrowLeft/ArrowRight 이동, Space 점프, R 재시작.
- `COYOTE = 0.1`, `JUMP_BUFFER = 0.1` (초).
- 화면 제목 표기: `KEROPPI JUMP`.
- 단위 테스트 없음(사용자 지시). 각 Task는 브라우저 수동 플레이 체크리스트로 검증.
- `npx cdk deploy`는 사용자 확인 후에만 실행. Bedrock 사용 안 함.

## Review Focus

1. **Space 키 자동반복:** 꾹 누르고 있으면 착지할 때마다 계속 점프되면 안 된다. `e.repeat`인 keydown은 무시하고 점프 버퍼는 새로 누를 때만 채운다. → Task 1 Step 4 체크.
2. **탭 전환 후 복귀(큰 dt):** 누적 dt를 0.25초로 자르고 프레임당 최대 5스텝만 돌린다. 이렇게 해야 지형을 뚫거나 한꺼번에 몰아서 처리되지 않는다. → Task 1 Step 4 체크.
3. **Space/화살표로 페이지 스크롤:** 게임 키에 대해 `preventDefault()`를 호출한다. → Task 1 Step 4 체크.
4. **리스폰 후 상태 잔존:** 가시나 낙사로 리스폰하면 속도, 코요테 타이머, 점프 버퍼를 0으로 초기화한다. 리스폰 직후 혼자 점프하거나 미끄러지면 안 된다. → Task 3 Step 3 체크.
5. **레벨 끝 카메라·이동:** 카메라는 `[0, levelW-640]` 범위로 자르고, 플레이어는 x를 `[0, levelW-w]` 범위로 막아 맵 밖으로 나가지 못한다. → Task 2 Step 4 체크.

---

### Task 1: Phase 1 — 엔진 (루프, 입력, 물리, Clawd 렌더)

**Files:**
- Create: `frontend/index.html`

**Interfaces:**
- Produces (같은 `<script>` 내 전역):
  - 상수 `W=640, H=360, TILE=16, PX=3, STEP=1/60, COYOTE=0.1, JUMP_BUFFER=0.1`
  - 물리 상수(튜닝 시작값): `GRAVITY=1400, JUMP_V=460, MAX_VX=150, ACCEL=1200, FRICTION=1400, MAX_FALL=600` (px/s 단위). 점프 높이 약 75px, 4.7타일.
  - `keys: Set<string>` (`e.code` 저장), `jumpPressed: boolean` (새 Space 입력 1회 플래그)
  - `player = { x, y, w:30, h:33, vx, vy, onGround, facing: 1|-1, coyote, buffer }`. 스프라이트는 `x-3`에 그려 히트박스 30px 기준으로 가운데 맞춤.
  - `update(dt: number): void`: 입력 → 가속/마찰 → 타이머 → 점프 → 중력 → `moveX/moveY`
  - `moveX(dx)`, `moveY(dy)`: Task 1에서는 바닥 `y = H - 40`만 판정, Task 2에서 타일 충돌로 교체
  - `drawClawd(ctx, x, y, flip: boolean): void`: `flip`이면 열 인덱스를 `11 - c`로 그린다
  - `render(): void`, `frame(t: DOMHighResTimeStamp): void`

- [ ] **Step 1: HTML 골격 작성.** `<canvas id="game" width="640" height="360">`. CSS: body 검정 배경, 캔버스 중앙 정렬, `image-rendering: pixelated`. `resize` 이벤트에서 `scale = max(1, floor(min(innerWidth/640, innerHeight/360)))`을 계산해 캔버스 CSS 크기를 정수배로 맞춘다.
- [ ] **Step 2: 입력.** keydown에서 대상 코드(`ArrowLeft, ArrowRight, Space, KeyR`)면 `preventDefault()`를 호출한다. `!e.repeat && code==='Space'`일 때 `jumpPressed = true`. keyup에서 `keys.delete`.
- [ ] **Step 3: 루프와 물리.** `frame`은 `acc += min(dt, 0.25)` 후 `while (acc >= STEP && n++ < 5)` 동안 `update(STEP)`을 돌린다. `update` 순서:
  1. `jumpPressed`면 `buffer = JUMP_BUFFER`, 플래그 해제. 그렇지 않으면 `buffer -= dt`.
  2. `onGround`면 `coyote = COYOTE`, 아니면 `coyote -= dt`.
  3. `buffer > 0 && coyote > 0`이면 `vy = -JUMP_V`, `buffer = coyote = 0`.
  4. Space를 일찍 떼고 `vy < 0`이면 `vy *= 0.5`(가변 점프, 구현자 판단).
  5. `vy = min(vy + GRAVITY*dt, MAX_FALL)`. 이어서 `moveX(vx*dt)`, `moveY(vy*dt)`.
- [ ] **Step 4: 수동 검증.** `python3 -m http.server 8080 -d frontend` 실행 후 `http://localhost:8080` 접속. 다음을 확인한다.
  - Clawd 모양과 색이 배열과 일치하고, 방향을 바꾸면 좌우로 뒤집힌다.
  - 좌우 이동, 점프, 착지가 된다.
  - 착지 직전에 Space를 눌러도 점프된다(버퍼).
  - Space를 꾹 누르면 한 번만 점프한다.
  - Space를 눌러도 페이지가 스크롤되지 않는다.
  - 다른 탭에 5초 있다가 돌아와도 Clawd가 바닥 아래로 빠지지 않는다.
  - DevTools 콘솔에 에러가 없다.
- [ ] **Step 5: Commit.** `git add frontend/index.html docs/ && git commit -m "feat: phase 1 engine loop, input, physics, Clawd sprite"`

### Task 2: Phase 2 — 레벨, 타일 충돌, 카메라

**Files:**
- Modify: `frontend/index.html`

**Interfaces:**
- Consumes: Task 1의 `player`, `update`, `moveX/moveY`, `render`
- Produces:
  - `LEVEL: string[]`: 22행, 각 행 길이 동일(약 200열). 맨 아래 2행은 지형이고 구덩이 3~4개를 둔다. 계단과 공중 발판을 섞고, 위가 막힌 통로는 높이 3타일 이상. `S` 1개, `F` 1개(맨 오른쪽 근처).
  - `levelW = LEVEL[0].length*TILE`, `levelH = LEVEL.length*TILE`
  - `tileAt(tx, ty): string`: 범위 밖에서 좌·우·위는 `'X'`, 아래는 `'.'`를 돌려준다(낙사 허용).
  - `solidAt(tx, ty): boolean` (`tileAt === 'X'`)
  - `spawn: {x, y}`: `S` 타일 기준으로 발이 타일 바닥에 오게 계산(`y = (ty+1)*TILE - player.h`)
  - `cam = {x, y}`, `updateCamera(): void`

- [ ] **Step 1: 맵 작성과 파싱.** 로드 시 `LEVEL`을 순회해 `S`를 찾아 `spawn`을 정하고, `S`는 `'.'`로 취급한다. 플레이어 시작 위치는 `spawn`.
- [ ] **Step 2: 축 분리 AABB.** `moveX(dx)`: `x += dx` 후 겹치는 타일 범위 `floor(x/TILE)..floor((x+w-1)/TILE)` × `floor(y/TILE)..floor((y+h-1)/TILE)`에서 solid를 찾는다. 있으면 `dx>0`일 때 `x = tx*TILE - w`, `dx<0`일 때 `x = (tx+1)*TILE`로 밀고 `vx = 0`. `moveY(dy)`도 같은 방식이며, `dy>0`에서 부딪히면 `onGround = true`, `vy = 0`. `moveY` 시작 시 `onGround = false`. 이후 `x`를 `[0, levelW-w]` 범위로 자른다.
- [ ] **Step 3: 카메라와 렌더.** `cam.x = clamp(player.x + w/2 - W/2, 0, levelW - W)`, `cam.y = clamp(player.y + h/2 - H/2, 0, levelH - H)`. 렌더 순서는 하늘 배경, 화면에 보이는 타일 범위만 그리기, Clawd. 그릴 때는 `Math.round(x - cam.x)`처럼 정수로 맞춰 픽셀이 흔들리지 않게 한다. 지형은 갈색 흙에 윗면 초록 띠(구현자 판단).
- [ ] **Step 4: 수동 검증.** 다음을 확인한다.
  - 벽에 막히고, 천장에 머리를 부딪히면 떨어진다.
  - 발판 모서리에서 걸리지 않는다.
  - 발판 끝을 지나 0.1초 안에 Space를 누르면 점프된다(코요테).
  - 카메라가 따라오고, 레벨 양 끝에서 멈추며 맵 바깥이 보이지 않는다.
  - 맨 왼쪽과 맨 오른쪽에서 플레이어가 맵 밖으로 나가지 않는다.
  - 3타일 통로를 지나갈 수 있다.
- [ ] **Step 5: Commit.** `git commit -am "feat: phase 2 tile level, AABB collision, camera"`

### Task 3: Phase 3 — 코인, 가시, 깃발, HUD, CLEAR/재시작

**Files:**
- Modify: `frontend/index.html`

**Interfaces:**
- Consumes: Task 2의 `LEVEL`, `spawn`, `tileAt`, `cam`
- Produces:
  - `coins: Set<string>`: 남은 코인 키 `"tx,ty"`. `totalCoins`, `collected: number`
  - `state: 'play' | 'clear'`
  - `respawn(): void`: 위치를 `spawn`으로 되돌리고 `vx, vy, coyote, buffer`를 0으로, `jumpPressed`를 false로 초기화한다. 코인은 유지.
  - `resetLevel(): void`: `coins`를 맵에서 다시 만들고 `collected = 0`, `state = 'play'`로 되돌린 뒤 `respawn()`.
  - `checkTriggers(): void`: 플레이어 AABB와 겹치는 타일을 검사한다.

- [ ] **Step 1: 트리거.** `update` 끝에서 `checkTriggers()`를 호출한다.
  - `C`이고 `coins`에 있으면 삭제하고 `collected++`.
  - `^`이면 `respawn()`. 판정 박스는 타일의 아래쪽 8px(구현자 판단, 억울한 죽음 방지).
  - `F`이면 `state = 'clear'`.
  - `player.y > levelH`이면 `respawn()`.
  - 코인·가시·깃발 타일은 비고체로 취급한다.
- [ ] **Step 2: HUD와 CLEAR 화면.** 왼쪽 위에 `KEROPPI JUMP`, 오른쪽 위에 `COIN collected/totalCoins`를 표시한다. 폰트는 `bold 12px monospace`이고 1px 그림자를 넣는다. `state==='clear'`이면 `update`의 물리를 멈추고 반투명 검정 오버레이 위에 `CLEAR!`, `COIN n/N`, `Press R to restart`를 가운데 정렬로 그린다. `KeyR` keydown은 상태와 관계없이 `resetLevel()`을 호출한다. 그리기는 코인은 노란 원, 가시는 회색 삼각형, 깃발은 막대와 깃발 모양(구현자 판단).
- [ ] **Step 3: 수동 검증.** 처음부터 끝까지 한 판 플레이하며 다음을 확인한다.
  - 코인을 먹으면 숫자가 오른다.
  - 가시에 닿으면 시작점으로 돌아가고, 먹은 코인은 그대로 남는다.
  - 리스폰 직후 혼자 점프하거나 미끄러지지 않는다.
  - 구덩이에 떨어지면 리스폰된다.
  - 깃발에 닿으면 CLEAR 화면이 나온다.
  - R을 누르면 코인과 위치가 처음 상태로 돌아간다.
  - 플레이 중 R도 동작한다.
  - 콘솔에 에러가 없다.
- [ ] **Step 4: Commit.** `git commit -am "feat: phase 3 coins, spikes, flag, HUD, clear/restart"`

### Task 4: Phase 4 — CDK S3 + CloudFront 배포

**Files:**
- Modify: `lib/clawd-jump-stack.ts`
- Modify: `test/clawd-jump.test.ts`: 사용하지 않는 SQS 예시 테스트를 지운다. jest가 빈 테스트 파일 때문에 실패하지 않도록 `test.todo` 한 줄만 남긴다.

**Interfaces:**
- Consumes: `frontend/index.html`
- Produces: CloudFormation 출력 `GameUrl` (`https://<distributionDomainName>`)

- [ ] **Step 1: README 확인(AGENTS.md 지시).** `grep -n '^#'`로 목차를 본 뒤 필요한 섹션만 읽는다.
  - `aws-s3/README.md`: 버킷, autoDeleteObjects
  - `aws-cloudfront/README.md`: Distribution
  - `aws-cloudfront-origins/README.md`: `S3BucketOrigin.withOriginAccessControl`
  - `aws-s3-deployment/README.md`: CloudFront Invalidation (l.337)
- [ ] **Step 2: 스택 작성.** 다음 리소스를 만든다.
  - `s3.Bucket`: `blockPublicAccess: BLOCK_ALL`, `enforceSSL: true`, `removalPolicy: DESTROY`, `autoDeleteObjects: true`
  - `cloudfront.Distribution`: `defaultBehavior.origin = origins.S3BucketOrigin.withOriginAccessControl(bucket)`, `viewerProtocolPolicy: REDIRECT_TO_HTTPS`, `defaultRootObject: 'index.html'`
  - `s3deploy.BucketDeployment`: `sources: [Source.asset(path.join(__dirname, '../frontend'))]`, `destinationBucket`, `distribution`, `distributionPaths: ['/*']`
  - `CfnOutput` 이름은 `GameUrl`
- [ ] **Step 3: 검증.** 다음 명령을 실행한다.
  - `npm run build`: 에러 0
  - `npm run test`: todo만 있고 통과
  - `npx cdk synth`: 템플릿에 `AWS::S3::Bucket`, `AWS::CloudFront::Distribution`, `AWS::CloudFront::OriginAccessControl`, `Custom::CDKBucketDeployment`가 있다
  - `npx cdk diff`: 생성만 있다
- [ ] **Step 4: 사용자 확인 후 배포.** 사용자에게 diff 요약을 보여주고 승인을 받는다. 그 다음 `npx cdk deploy --require-approval never`를 실행한다. 계정이 bootstrap되지 않았으면 `npx cdk bootstrap`도 승인 범위에 포함해 함께 묻는다.
- [ ] **Step 5: 배포 검증.** `curl -sI <GameUrl>`이 `200`이고 `content-type: text/html`이어야 한다. 브라우저에서 URL로 한 판 클리어한다.
- [ ] **Step 6: Commit.** `git add lib test && git commit -m "feat: phase 4 CDK S3 + CloudFront deployment"`
