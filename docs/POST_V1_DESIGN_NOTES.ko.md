# ProofFrontier 공개 v1 이후 개선 후보

> 상태: 공개 v1 이후 검토할 비차단 설계 메모<br>
> 원칙: 실제 사용 사례와 재현된 실패를 바탕으로 우선순위를 다시 정한다.

## 1. 노드 정체성

현재 FQN 중심 ID를 declaration occurrence 기반 ID로 확장할 수 있다.

```text
graphId = document identity + source span + occurrence ordinal
probeName = Lean Environment 조회 이름
displayName = 사용자 표시 이름
```

v1은 중복 FQN graph ID를 정확히 구분하지 않고 exact 프로브를 fail-closed로
거부한다. occurrence ID는 이런 입력을 실제로 지원할 필요가 확인될 때 도입한다.

## 2. 논리 파일과 임시 파일

다음 정체성을 분리하는 설계가 필요하다.

- 사용자가 편집하는 논리 파일 또는 모듈
- 프로브 실행에 사용되는 물리 임시 파일
- 프로젝트 root와 import 환경
- 붙여넣기 버퍼의 합성 파일 정체성

프로젝트 문맥 재현이 필요한 사용 사례가 축적되면 evidence key 확장과 함께
설계한다.

## 3. 검증 환경 지문

source hash 외에 다음을 결박하는 방안을 검토한다.

- Lean/toolchain 버전
- workspace root
- 논리 모듈명
- import 집합
- build artifact 또는 dependency 상태
- trust policy version/hash

완전한 지문을 제공하기 전에는 source hash가 전체 환경 재현성을 보장한다고
표현하지 않는다.

## 4. 진단 범위

현재 command boundary와 선언 범위 휴리스틱을 장기적으로 Lean parser,
info tree 또는 source range 기반 모델로 바꿀 수 있다.

v1은 선언 자체의 error를 Lean recovery node보다 우선한다. 후속 context
오류는 선언 범위에서 제외하여 이미 정상 실현된 선언을 `failed`로 강등하지
않는 최소 규칙만 보장한다.

후보 범주:

- declaration diagnostic
- file/context diagnostic
- protocol diagnostic

실제 오귀속 사례와 Lean API 안정성을 확인한 뒤 schema v2와 함께 검토한다.

## 5. 상태와 provenance

후속 후보:

- `checked` UI 명칭을 `realized`로 변경
- freshness를 `current/stale/none` 독립 API 필드로 제공
- exact와 approximate 근거가 섞인 경로의 provenance 집합
- trust 정책과 근거 변경 이력
- API schema v2

v1에서는 `kernel/source/trust/trustBasis/openDependency` 조합으로 충분한지
실제 사용을 통해 먼저 검증한다.

## 6. 협업 기능

ProofFrontier가 공동 연구 도구로 확장될 때 검토할 항목:

- 스냅샷 간 frontier 변화 비교
- 노드별 담당자와 검토 상태
- 근거 문헌과 discussion 연결
- Git commit/PR별 증거 변화
- 여러 파일과 프로젝트 규모의 그래프
- 독립 커널 replay 또는 외부 검증기 연계

이 기능들은 현재 로컬 연구 작업 보조 도구의 정확성 계약을 안정화한 뒤
별도 제품 설계로 다룬다.
