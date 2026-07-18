# oidc-trust-probe

KRUG OIDC 세미나 **Tier 0 실증 도구** — npm Trusted Publishing이 reusable
workflow를 검증할 때 **caller만 보는가, callee도 보는가**를 직접 확인한다.

> 검증 대상 주장 (세미나 3부 매트릭스 npm 행 / 항목 1):
> *"npm은 reusable workflow를 '지원'하지만 caller(최상위 워크플로우) 이름만
> 체크하고 callee(실제 실행된 reusable workflow)는 검증하지 않는다."*

이 리포는 그 주장을 **말이 아니라 로그로** 증명(또는 반증)하기 위한 최소 패키지다.

---

## 아이디어

같은 `npm publish`를 두 경로로 실행하고, 각 경로에서 발급되는 **OIDC 토큰의
claim을 덤프**해서 비교한다.

| 경로 | 실행 워크플로우 | `workflow_ref` (caller) | `job_workflow_ref` (callee) |
|---|---|---|---|
| A. 직접 (control) | `publish-direct.yml` | publish-direct.yml | publish-direct.yml (동일) |
| B. 경유 (key test) | `publish-via-reusable.yml` → `reusable-publish.yml` | publish-**via-reusable**.yml | reusable-**publish**.yml (**다름**) |

npm Trusted Publisher를 **caller 파일**로 등록해두고 경로 B가 성공하면 →
npm은 caller(`workflow_ref`)만 매칭했고 실제 publish가 돈 callee는 안 봤다는
뜻. **"caller-only" 확정.**

---

## 사전 준비

- npm 계정 (2FA 권장) + `gh` CLI 로그인
- 이 리포를 GitHub에 올린다 (아래 "커밋 & 원격 생성")
- 패키지 이름을 **npm에서 안 겹치는 것으로** 바꾼다 → `package.json`의 `name`,
  `LICENSE`/`package.json`의 `<your-name>`, `<your-user>` 치환

> **public vs private**: 이 프로브는 시크릿이 없는 throwaway라 **public 리포로
> 둬도 안전**하다(여긴 self-hosted 러너를 안 붙이므로 7-3의 "public 리포 금지"
> 규칙과 무관). public이면 provenance/attestation까지 붙는 보너스가 있다.

### 커밋 & 원격 생성 (지금은 여기까지 안 되어 있음 — 커밋 직전 상태)

```bash
cd npm-tp-probe
git commit -m "init: npm trusted publishing probe"
gh repo create oidc-trust-probe --private --source=. --remote=origin --push
# public으로 하려면 --private 대신 --public
```

---

## 실험 절차

### 실험 1 — 직접 publish (control)

1. npm 웹 → 패키지 생성 후 **Settings → Trusted Publisher** 에 등록:
   - Provider: GitHub Actions
   - Repository: `<your-user>/oidc-trust-probe`
   - Workflow filename: **`publish-direct.yml`**
2. GitHub → Actions → **publish-direct** → Run workflow
3. 로그의 `Dump OIDC token claims` 스텝에서 `workflow_ref == job_workflow_ref`
   확인, publish 성공 확인 → **경로가 살아있음(baseline)**

### 실험 2 — reusable 경유 (핵심)

1. npm Trusted Publisher의 Workflow filename을 **`publish-via-reusable.yml`**
   로 변경 (caller를 신뢰 대상으로 지정)
2. GitHub → Actions → **publish-via-reusable** → Run workflow
   - `package.json`의 `version`을 먼저 올려야 함 (같은 버전 재발행 불가):
     `npm version patch` 후 커밋/푸시
3. `reusable-publish` 잡 로그의 claim 덤프에서
   **`workflow_ref`(=publish-via-reusable) ≠ `job_workflow_ref`(=reusable-publish)**
   확인
4. **판정**:

| 결과 | 해석 | 세미나 매트릭스 npm 행 |
|---|---|---|
| publish **성공** | npm이 caller만 매칭, callee 미검증 | "노출 (설계상 확인)" 유지 — 실증 완료 |
| publish **실패** (claim mismatch) | npm이 callee(`job_workflow_ref`)도 검증 | 톤 하향: "부분 노출 / 재검토" |

> 실험 2 실행 전에 [deep-research 결과](../krug_oidc_seminar_outline.md의 TODO)와
> 대조할 것. 리서치가 "callee 검증함"으로 나오면 실험 2는 실패해야 정상이고,
> 그 자체가 매트릭스를 고치는 근거가 된다.

### 실험 3 — 공격 시뮬레이션 (선택, 케이스 A 연결)

경로 B에서 `publish-via-reusable.yml`의 `uses:`를 **다른 리포/브랜치의 reusable
workflow를 SHA 없이 브랜치로 참조**하도록 바꾸고, 그 브랜치의 `reusable-publish.yml`
을 "공격자 버전"으로 교체한다. caller claim은 그대로인데 실제 실행 코드만 바뀐다.
→ 세미나 케이스 A의 "SHA 미고정 = 구멍" 서사를 npm에서 재현.

---

## 결과를 세미나에 쓰는 법

- **머니샷**: 실험 1과 실험 2의 claim 덤프를 **나란히 놓은 스크린샷** 한 장.
  `workflow_ref`/`job_workflow_ref`가 경로 B에서 갈라지는 게 육안으로 보인다.
- 실험 2 publish 성공 로그 = 매트릭스 "npm: caller 이름만 체크" 주장의 1차 증거.
- 이건 **AWS와의 대조**로 이어진다: AWS는 애초에 `job_workflow_ref`를 condition
  으로 걸 수도 없다(항목 4) → "둘 다 callee를 못/안 본다"는 공통 구조로 묶임.

---

## 정리 / 안전

- 발행한 테스트 버전은 72시간 내 `npm unpublish oidc-trust-probe@<ver>` 로 회수 가능
- 매 실험마다 `npm version patch` 로 버전 올릴 것
- 이 패키지는 아무 기능도 없음 — 공급망에 의미 있는 코드를 넣지 말 것
- 항목 2(계정 재활용/owner_id 검증)는 코드로 재현이 어려움 → 문서/동작 관찰로
  별도 확인 (deep-research 담당)

---

## 파일 구조

```
npm-tp-probe/
├─ package.json                         # name/author 치환 필요
├─ index.js                             # trivial payload
├─ LICENSE
├─ .gitignore
└─ .github/workflows/
   ├─ publish-direct.yml                # 실험 1 (control)
   ├─ publish-via-reusable.yml          # 실험 2 caller
   └─ reusable-publish.yml              # 실험 2 callee (실제 publish)
```
