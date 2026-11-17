# Keroppi Jump — 설계 (short)

## 의도
2시간 캡스톤. 외부 의존성 없는 단일 HTML5 Canvas 픽셀아트 플랫포머를 만들고 CDK로 S3 + CloudFront에 배포한다.
주인공 Clawd가 코인을 모으고 가시를 피해 깃발에 도달하면 클리어.

## 목표 / 비목표 / 안티목표
- 목표: `frontend/index.html` 하나로 완결, 60fps 플레이, 공개 URL로 배포
- 비목표: 단위 테스트(브라우저 수동 플레이로 갈음), 사운드, 다중 레벨, Bedrock
- 안티목표: 외부 라이브러리/에셋 사용, 공개 S3 버킷

## 제약
- 순수 HTML5 Canvas + vanilla JS, 640x360 논리 해상도, `image-rendering: pixelated`, requestAnimationFrame
- 타일 16px, 맵 문자: `X` 지형, `C` 코인, `^` 가시, `F` 깃발, `.` 빈칸 (`S` 시작점 — 구현자 판단으로 추가)
- 조작: ArrowLeft/Right 이동, Space 점프, R 재시작
- 코요테 타임 0.1초, 점프 버퍼 0.1초, 중력, AABB 충돌
- `cdk deploy`는 사용자 확인 후 실행

## 접근 방식
- **채택:** 고정 스텝(1/60s) 누적 루프 + 축 분리 AABB(X 이동→해소, Y 이동→해소) + 문자열 타일맵 + 플레이어 추적 카메라(레벨 경계 클램프). 배포는 비공개 S3 + CloudFront(OAC) + `BucketDeployment`.
- 기각: S3 정적 웹사이트 호스팅(버킷 공개 필요), Amplify 등 타 서비스(요구사항 "CDK S3+CloudFront" 이탈), 가변 dt 물리(점프 높이가 프레임레이트에 의존).

## 결정 사항 (사용자)
- 제목/화면 표기: **"KEROPPI JUMP"** (상표 이슈 고지 후 사용자가 유지 결정)
- Clawd 스프라이트: 제공된 `CLAWD` 배열과 `PALETTE`를 그대로, 셀 3px, 좌우 반전 지원
- 구현 순서: Phase 1 엔진(루프·입력·물리·Clawd 렌더) → Phase 2 레벨·충돌·카메라 → Phase 3 코인·가시·깃발·HUD → Phase 4 CDK 배포

## 구현자 판단 (제안, 수정 가능)
- 스프라이트 배열은 실제로 12열 x **11행** → 36x33px. 11행 전부 렌더. 히트박스 30x33(좌우 3px씩 축소), 레벨의 통로 높이는 최소 3타일.
- 레벨 약 200x22 타일(3200x352px). 화면 밖 낙하도 가시와 동일하게 시작점 리스폰.
- 리스폰 시 이미 먹은 코인은 유지, R은 레벨 전체(코인 포함) 초기화. CLEAR 화면에서 R로 재시작.
- 물리 상수(중력·점프 속도·최대 이동 속도)는 수동 플레이로 튜닝.
- CDK: 버킷 `removalPolicy: DESTROY` + `autoDeleteObjects`(캡스톤 정리 용이), 기본 루트 객체 `index.html`, 출력에 CloudFront URL.
