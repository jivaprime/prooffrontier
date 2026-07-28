# ProofFrontier 공개 v1 정확성 명세

> 상태: **Approved Release Candidate**<br>
> 작성일: 2026-07-28<br>
> 대상 릴리스: 공개 v1<br>
> 규범 상태: 공개 v1 구현과 릴리스 판정의 기준<br>
> 버전 표기: 실제 SemVer 태그는 별도 릴리스 절차에서 결정

## 1. 목적

ProofFrontier는 완성된 증명만 판결하는 도구가 아니다. 작성 중인 Lean 소스에서
선언, 의존성, 열린 가정과 검증 상태를 함께 보여주는 연구 작업 보조 도구다.

공개 v1의 목표는 완전한 provenance 시스템을 만드는 것이 아니다. 사용자가
다음 세 가지 틀린 확신을 받는 경로를 막는 것이다.

1. 추측이나 `sorryAx`에 의존하는 결과가 `verified-closed`로 보이는 것
2. 이전 문서의 검증 증거가 새 소스나 새 파일의 증거처럼 보이는 것
3. 지원하지 않는 API 응답이 일부라도 verified 상태로 적용되는 것

## 2. 핵심 표시 계약

ProofFrontier의 상태 축은 서로 대체하지 않는다.

- `source`: 소스가 `proved`, `sorry`, `axiom` 중 무엇인가
- `kernel`: 선언이 `checked`, `failed`, `unchecked` 중 무엇인가
- `trust`: 폐포가 `closed`, `library`, `cited-external`, `conjectural` 중 무엇인가
- `trustBasis`: trust가 커널 폐포에서 왔는지 소스 근사에서 왔는지
- `openDependency`: 전이적으로 `sorryAx` 또는 열린 소스에 의존하는지

`checked`는 닫힌 증명과 동의어가 아니다.

`verified-closed`는 다음 조건을 모두 만족할 때만 허용한다.

```text
kernel = checked
source = proved
trust = closed
openDependency = false
trustBasis = kernel-exact
sorryAx = 없음
freshness = current
```

현재 JSON 내부 값 `trustBasis: "kernel"`은 UI와 문서에서
`kernel-exact`로 표시한다. `freshness=current`는 v1에서 별도 API 필드가
아니라 현재 UI가 stale 상태가 아니며 문서·요청·소스 정체성 검사를 통과했다는
뜻이다.

## 3. Release Blockers

### CR-1. exact trust 재전파와 closed 표시

커널 공리 폐포가 있는 노드를 먼저 exact seed로 확정한다.

v1 trust 경고 순서는 다음과 같이 고정한다.

```text
closed < library < cited-external < conjectural
```

- exact seed의 `trust`, `openDependency`, `trustBasis`는 근사 전파가
  덮어쓰지 않는다.
- 근사 노드의 최종 trust는 자신의 기본 trust와 모든 의존 노드의 최종 trust
  중 가장 강한 경고값이다.
- exact seed가 확정된 뒤 나머지 source-approx 노드에 이 규칙을 고정점까지
  적용한다.
- 알 수 없는 외부 공리는 보수적으로 `conjectural`이다.
- `verified-closed`는 `trustBasis=kernel-exact`인 노드에만 표시한다.
- 복잡한 provenance 집합과 trust policy hash는 도입하지 않는다.

`openDependency`는 다음 OR 규칙으로 전파한다.

```text
openDependency(node)
= node 자체에 열린 sorry가 있음
  OR 의존 노드 중 openDependency가 있음
```

필수 회귀 테스트:

```text
exact conjectural 노드 -> 하류 근사 노드도 conjectural
exact sorryAx 노드 -> 하류 근사 노드도 openDependency
trustBasis가 source-approx이면 다른 축이 닫혀도 verified-closed가 아님
```

커널 exact 결과가 소스 근사의 오탐을 제거하여 trust를 개선하는 반대 방향
회귀도 유지하되, 공개 차단 조건으로 보지는 않는다.

### CR-2. 선언 오류와 후속 문맥 오류 분리

정밀한 diagnostic scope 모델은 v1 범위가 아니다. 다음 한 가지 판정만
보장한다.

```text
선언 자체에 귀속된 error가 있으면 failed
그런 error가 없고 현재 스냅샷의 인증된 node result가 성공이면 checked
둘 다 없으면 unchecked
```

Lean의 오류 복구는 실패한 선언에도 `sorryAx`를 포함한 상수를 Environment에
남길 수 있으므로 node result만으로 declaration error를 덮어쓰지 않는다.
대신 뒤따르는 독립 context diagnostic을 선언 범위에서 제외하여 이미 정상
실현된 선언을 강등하지 않는다.

필수 회귀 테스트:

```lean
theorem good : True := trivial
#check Missing.name
```

기대 결과:

```text
good = checked
Missing.name 오류는 good의 declaration error로 귀속되지 않음
```

정확한 command boundary, info tree 기반 범위와 세밀한 context diagnostic API는
post-v1 설계로 남긴다.

### CR-3. 소스·문서 변경 시 evidence hard revoke

다음 사건이 발생하면 하나의 revoke 경로를 통해 이전 검증 증거를 즉시
무효화한다.

```text
에디터 수정
파일 선택
샘플 선택
```

최소 철회 대상:

```text
checked/failed 표시
공리 폐포와 unknown axiom
커널에서 얻은 trust 결과
openDependency의 verified 판정
actual Lean name
kernel-direct 간선
source hash
현재 verified payload
verified-closed 표시
```

파일 선택에서는 파일 내용 읽기가 끝난 뒤가 아니라 **선택 이벤트 직후** 먼저
철회해야 한다.

비동기 parse/verify/file-read 결과는 다음 정체성이 모두 현재 상태와 일치할
때만 적용한다.

```text
documentGeneration
requestId
source identity (현재 소스 및 검증 sourceHash)
```

별도의 대규모 UI 상태 머신은 도입하지 않는다.

필수 DOM 회귀 테스트:

```text
A 검증 후 B 파일을 선택하면 B 읽기 완료 전 A의 검증 장식이 사라짐
A 검증 요청 후 소스가 바뀌면 늦게 도착한 A 응답이 적용되지 않음
```

### CR-4. schemaVersion fail-closed

서버는 이미 최상위 `schemaVersion: 1`을 출력한다. 클라이언트는 payload의
다른 필드를 적용하기 전에 이 값을 검사한다.

```text
payload.schemaVersion === 1
```

버전이 없거나 지원 값과 다르면 다음과 같이 처리한다.

- payload의 노드, 그래프, run 정보를 하나도 적용하지 않는다.
- 기존 verified 증거를 철회한다.
- protocol error를 표시한다.
- 부분 적용 후 롤백하는 방식은 사용하지 않는다.

응답 적용 전 request identity, Document Identity와 현재 source를 먼저
검사한다. 현재 요청이 아닌 응답은 화면 상태를 전혀 변경하지 않고 폐기한다.
`schemaVersion`과 검증 `sourceHash`는 현재 활성 요청에 해당하는 응답에서만
검사하며, schema 오류도 그 경우에만 protocol diagnostic으로 표시한다.

필수 DOM 회귀 테스트:

```text
현재 응답의 schemaVersion이 없거나 1이 아니면 어떤 노드도 verified 상태로
적용되지 않음
```

## 4. v1 결정 기록

| 항목 | v1 결정 |
|---|---|
| D-1 | API의 `checked`를 유지한다. UI 툴팁에서 “현재 소스의 인증된 Lean Environment에서 선언이 실현됨”으로 설명한다. |
| D-2 | 파일·샘플 교체 시 기존 그래프와 verified evidence를 hard clear한다. |
| D-3 | 근사 간선이 하나라도 개입한 trust 결과는 `source-approx`다. exact seed의 `trustBasis`만 `kernel-exact`다. |
| D-4 | 클라이언트가 `schemaVersion`을 payload 적용 전에 검사한다. |
| D-5 | occurrence ID는 post-v1으로 연기한다. 중복 FQN graph ID는 exact 프로브 전체를 fail-closed로 거부한다. |
| D-6 | Evidence binding은 `document identity + sourceHash + pinned toolchain`이다. Application guard는 `documentGeneration + requestId + schemaVersion`이며 evidence identity가 아니다. |
| D-7 | freshness는 개념적으로 독립 축이다. v1에서는 API schema를 변경하지 않고 UI stale 상태로 집행한다. |

## 5. Known Limitations

공개 v1에서는 다음 제한을 명시하고 수용한다.

- declaration diagnostic 귀속은 일부 파서 휴리스틱이다.
- 중복 FQN declaration occurrence를 별도 노드 ID로 구분하지 않는다. 이런
  입력의 exact 프로브는 fail-closed이며 occurrence 기반 지원은 post-v1이다.
- `source-approx` 간선은 실제 커널 의존성의 근사치다.
- source hash는 import, workspace, build artifact를 포함한 전체 Lean 환경의
  재현성을 보장하지 않는다.
- 실제 파일의 논리 모듈명과 프로브용 물리 임시 경로를 완전히 분리하지 않는다.
- freshness는 독립 API 축이 아니라 현재 UI 무효화 상태로 관리한다.
- API schema v2와 혼합 provenance 집합은 제공하지 않는다.

위 제한은 숨기지 않되 공개 v1의 차단 조건으로 확대하지 않는다.

## 6. 보안 경계

공개 v1은 사용자가 자기 컴퓨터에서 신뢰하는 소스를 실행하는 로컬 도구를
기본 전제로 한다.

임의 사용자가 Lean 소스를 제출하는 다중 사용자 웹 서비스로 직접
호스팅하려면 다음이 별도의 출시 차단 조건이 된다.

- OS 또는 컨테이너 수준 실행 샌드박스
- CPU, 메모리, 실행 시간과 프로세스 제한
- 네트워크 및 파일시스템 접근 제한
- 실행별 전용 임시 디렉터리와 권한 격리
- 사용자 간 workspace 및 결과 격리

현재 로컬 서버를 그대로 공개 다중 사용자 서비스로 노출해서는 안 된다.

## 7. 출시 판정

다음 일곱 항목을 모두 통과하면 공개 v1 정확성 범위를 충족한다.

```text
1. exact trust가 하류 근사 노드로 재전파됨
2. source-approx 노드가 verified-closed로 과장되지 않음
3. 파일·샘플 교체 즉시 이전 evidence가 사라짐
4. 오래된 검증 응답이 새 문서에 적용되지 않음
5. 현재 활성 요청의 schemaVersion 불일치가 부분 적용 없이 거부됨
6. 인증된 정상 선언이 후속 context 오류로 failed가 되지 않음
7. Lean 4.32.1 전체 CI와 릴리스 검사가 통과함
```

## 8. 문서 확정

이 문서의 목적·표시 계약·CR-1~CR-4·D-1~D-7은 공개 v1 기준으로 확정한다.
특정 로컬 또는 임시 커밋 SHA는 규범의 일부가 아니다. 실제 출시 여부는
7장의 회귀 테스트와 고정 toolchain 검증 결과로 판정한다.

장기 설계 항목은
[`POST_V1_DESIGN_NOTES.ko.md`](POST_V1_DESIGN_NOTES.ko.md)에 분리한다.
