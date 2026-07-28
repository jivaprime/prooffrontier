# ProofFrontier 방법론

이 문서는 ProofFrontier의 수학 내용이 아니라 **논증을 Lean 선언 그래프로 옮기고,
보이는 노드와 Lean 커널의 검증 단위를 일치시키는 작업 규약**을 설명한다.
현재 참조 구현은 이 저장소의 루트에 있다.

## 1. 문제의식

긴 논증을 Lean으로 옮길 때 두 가지 실패가 자주 생긴다.

1. **가짜 완결**: 파일이 typecheck됐다는 이유로 증명이 닫혔다고 착각한다.
   실제 결론은 `sorry`, 신규 `axiom`, 또는 외부 결과에 기대고 있을 수 있다.
2. **시각과 검증의 불일치**: UI에는 여러 증명 노드가 보이지만 Lean은 파일
   전체만 검사한다. 그 반환코드를 모든 노드에 칠하면, 사용자가 보는 검증
   단위와 실제 검증 단위가 다르다.

ProofFrontier의 목적은 단순한 구문 그래프가 아니다. **그래프의 한 노드가 Lean이
확인한 한 선언을 가리키고, 실선 간선이 커널이 관찰한 직접 의존성을 가리키게
하는 것**이 핵심이다.

이 규약은 완성된 증명의 합격 여부만 판정하기 위한 것이 아니다. `sorry`,
외부 정리, 신규 axiom, 실패 선언을 이름과 근거가 있는 연구 상태로 보존하여,
현재까지의 성과와 남은 한계가 같은 그래프에서 확인되게 하는 것이 목적이다.

## 2. 순서 불변식

논증 처리 순서는 다음과 같이 고정한다.

```text
논문·문서·수식
      ↓  사람이 의미를 보존해 번역
Lean 소스
      ↓  정적 선언 파싱
완전 수식 선언 ID를 가진 노드 + source-approx 간선
      ↓  원본을 정교화한 최종 Environment에 그래프 노드 목록을 질의
노드별 실제 커널 ID + kernel-direct 간선 + axiom 폐포
      ↓
동일한 노드·간선을 UI에 표시
```

현재 구현은 첫 번째 화살표, 즉 논문·문서의 주장이 Lean 선언으로 의미를
보존해 번역됐는지를 인증하지 않는다. 커널 판정은 정확한 Lean 선언에 대한
판정이며, 원 주장과의 의미 일치는 별도의 사람 검토나 blueprint 연결이
필요하다.

별도 Lean 드라이버는 원본 Lean 소스를 변형 없이 한 번 정교화한다. 파일 성공
여부만으로 그래프의 모든 노드를 `checked`로 만들지 않으며, 노드 라벨과 검증
간선은 그 정교화 실행의 최종 `Environment`에서 이미 만든 완전수식 그래프 ID를
질의해 얻은 노드별 결과에서만 나온다.

따라서 다음 역순은 금지한다.

```text
파일 전체 typecheck → 성공 결과를 임의로 노드에 분배 → 그래프 생성
```

이 역순에서는 시각 정보가 검증 작용을 대표하지 못한다.

## 3. 선언 정체성

그래프의 선언 ID는 짧은 이름이 아니라 네임스페이스를 포함한 **완전 수식 이름**
(fully qualified name)이다.

```lean
namespace Alpha
theorem shared : True := by trivial
end Alpha

namespace Beta
theorem shared : True := by trivial
end Beta
```

두 노드는 `Alpha.shared`, `Beta.shared`로 분리한다. 표시와 소스 탐색을 위해
짧은 `sourceName`도 보존하지만, 노드 키·의존성·선택 상태에는 완전 수식 ID를
사용한다.

선언 경계를 찾을 때 다음 수식어도 함께 인식한다.

- 속성: `@[simp]`, `@[instance]` 등
- 접근/동작 수식어: `private`, `protected`, `noncomputable`, `unsafe`,
  `partial`, `nonrec`
- 선언 종류: `def`, `abbrev`, `lemma`, `theorem`, `axiom`, `constant`,
  `opaque`

`private` 선언은 소스 ID와 Lean 내부의 mangled 커널 이름이 다르다.
ProofFrontier는 둘을 별도 필드로 보존하고 최종 환경 관찰 결과에서 역매핑한다.

## 4. 파싱과 초기 그래프

UI와 CLI는 모두 `prooffrontier/parser.py`를 사용한다. 브라우저에 별도 파서를
복제하지 않는다.

1. 줄·중첩 블록 주석을 길이 보존 방식으로 공백 처리한다.
2. `namespace`/`section`/`end` 문맥과 선언 경계를 읽는다.
3. 선언 본문은 현재 선언 시작부터 다음 선언 시작 직전까지로 자른다.
4. 주석이 제거된 본문에서 내부 선언 이름을 찾아 초기 의존성을 만든다.
5. 네임스페이스 안의 짧은 참조는 가장 가까운 문맥부터 완전 수식 ID로 해석한다.

이 단계의 간선은 `source-approx`다. `simp`, `omega`, 매크로 전개, 타입클래스
탐색처럼 이름이 본문에 직접 나타나지 않는 의존성은 놓칠 수 있다. 반대로 문자열
속 이름은 잘못 잡을 수 있다. 따라서 이 간선은 점선으로 표시하며 커널 근거로
보고하지 않는다.

## 5. 세 축 상태

각 선언은 서로 덮어쓰지 않는 세 축으로 표현한다.

| 축 | 값 | 질문 |
|---|---|---|
| `kernel` | `checked` / `failed` / `unchecked` | 이 소스 해시의 이 선언을 Lean이 확인했는가 |
| `source` | `proved` / `sorry` / `axiom` | 소스가 어떤 종류의 완결성을 주장하는가 |
| `trust` | `closed` / `library` / `cited-external` / `conjectural` | 결론이 전이적으로 무엇에 기대는가 |

`checked`는 “무가정으로 증명됨”과 동의어가 아니다. 예를 들어 Lean이
`axiom new_hypothesis`를 유효한 선언으로 받아들이면 그 노드는
`kernel=checked`, `source=axiom`, `trust=conjectural`이다. 세 축을 한 색이나
단일 `verified` 값으로 접지 않는다.

정적 `source` 분류는 다음과 같다.

```text
kind ∈ {axiom, constant} → axiom
주석 제거 본문에 독립 토큰 sorry → sorry
그 외 → proved
```

`opaque`는 환원 시 본문을 노출하지 않지만, 본문 자체는 Lean이 정교화하고
검사하는 definition-like 선언이다. 따라서 `opaque`라는 키워드만으로 axiom으로
분류하지 않는다.

## 6. 노드·간선 커널 검증

검증 요청은 같은 소스 문자열과 그 sha256 해시에 묶인다.

1. 정적 파서가 완전수식 그래프 ID와 질의 대상 목록을 먼저 확정한다.
2. Python 실행기는 일회성 256비트 토큰을 표준입력으로 별도 Lean 드라이버에
   전달한다. 드라이버는 사용자 소스를 실행하기 전에 이 입력을 모두 소비한다.
3. 드라이버는 사용자 소스에 import, 선언, 명령을 추가하지 않고 Lean의
   `Language.Lean.process`로 원본 문자열을 한 번 정교화한다. 대상 환경의 import와
   옵션은 오직 원본 헤더에서 구성된다.
4. 그 실행의 최종 `Environment`에서 현재 파일이 실제로 만든 완전수식 선언만
   resolve한다. private 선언은 실제 커널 이름과 사용자 이름을 함께 대조한다.
5. `ConstantInfo`의 사용 상수로 직접 의존성을, `collectAxioms`로 전이적 axiom
   폐포를 얻는다.
6. 드라이버는 토큰이 포함된 구조화 결과 프레임 하나를 출력한다. 실행기는 같은
   토큰의 프레임이 정확히 하나이고, 노드 ID·질의 이름·실제 커널 이름이 모두
   일치할 때만 결과를 원래 그래프 ID에 역매핑한다.

사용자 코드가 기존 `PFNODE` 문자열이나 결과 프로토콜처럼 보이는 문자열을
출력해도 토큰을 알 수 없으므로 인증되지 않는다. 사용자 코드가 프로세스를 조기
종료하면 인증 프레임이 없으므로 모든 결과는 보수적으로 거부된다. Lean 소스 자체는
메타프로그램과 IO를 실행할 수 있으므로, 이 채널 인증은 비신뢰 코드를 샌드박스하는
기능을 대신하지 않는다.

성공한 노드만 `kernel=checked`가 되고, 그 노드로 들어가는 인파일 의존성은
`kernel-direct`로 교체된다. 실패 진단이 선언 줄 범위에 있으면 `failed`,
결과가 없으면 `unchecked`다. 뒤 선언의 오류 때문에 원본 파일 전체가 실패해도
앞 선언이 최종 환경에 실제로 남아 있다면 앞 선언은 계속 `checked`일 수 있다.

직접 간선과 axiom 폐포는 다른 정보다.

- **직접 간선**: 그래프 구조. `ConstantInfo`가 실제 사용한 인파일 상수.
- **axiom 폐포**: 전이적 신뢰 상태. 결론 아래 남아 있는 모든 axiom.

폐포를 직접 간선처럼 그리면 중간 논증 구조가 사라지므로 둘을 섞지 않는다.

## 7. Trust 규약

axiom 계열 선언에는 근거를 붙인다.

```lean
-- PF-TRUST: library ref="Lean core"
axiom known_fact : P

-- PF-TRUST: cited-external ref="Author (2025), Theorem 3"
axiom literature_fact : Q

-- PF-TRUST: conjectural ref="new hypothesis"
axiom new_hypothesis : R
```

주석 없는 axiom은 보수적으로 `conjectural`로 분류한다. 커널 폐포에 나타났지만
현재 파일의 선언이나 알려진 안전 axiom으로 설명할 수 없는 이름도
`unknownAxioms`에 기록하고 conjectural로 취급한다. 커널 폐포의 이름은 실제 커널
이름 또는 완전수식 그래프 ID로만 귀속하며, 마지막 이름 조각이 같다는 이유로
인파일 axiom의 근거를 물려주지 않는다.

남은 큰 과제 하나 안의 세부 작업은 다음처럼 숨기지 않고 노출한다.

```lean
theorem MAIN_TASK : Goal := by
  -- PF-SUBTASK: 국소 추정
  -- PF-SUBTASK: 균일 오차 제어
  sorry
```

## 8. stale 무효화

검증 결과는 파일명이 아니라 **검증한 소스 해시**에 대한 진술이다. 에디터
버퍼가 한 글자라도 바뀌면 UI는 서버 응답을 기다리지 않고 즉시 다음을 수행한다.

- 모든 `checked`/`failed`를 `unchecked`로 되돌린다.
- `actualName`, axiom 폐포, 이전 진단을 지운다.
- `kernel-direct` 간선을 저장해 둔 `approxDeps`로 복원한다.
- 간선 근거를 `source-approx`, trust 근거를 `stale`로 바꾼다.
- 현재 버퍼를 짧은 debounce 뒤 다시 정적 파싱한다.

검증 중 버퍼가 바뀌거나 더 최신 요청이 시작되면 이전 응답은 폐기한다. 따라서
화면의 초록 테두리나 실선이 현재 보이는 소스와 다른 해시를 가리킬 수 없다.

## 9. 그래프 표시 규약

- 채움색은 `source`, 테두리는 `kernel`, 배지는 `trust`를 나타낸다.
- `kernel-direct`는 실선, `source-approx`는 점선이다.
- 보라색 간선은 양 끝 중 하나가 열린 `sorry`/`axiom`이거나 `failed`임을
  뜻한다. 색은 폐쇄성, 선형은 간선 근거이므로 서로 독립이다.
- 선택한 노드의 상세 패널에는 완전 수식 ID, 소스 수식어, 실제 커널 ID,
  직접 의존성의 근거, axiom 폐포, 진단을 함께 표시한다.
- `route` 뷰는 목표 정리의 의존성 폐포, `full`은 전체 선언,
  `open`은 열린 노드와 직접 이웃을 보여준다.
- 최종 목표 탐색은 짧은 이름을 표시용으로만 쓰고, 내부 선택은 완전 수식 ID로
  수행한다.

시각 표현은 장식이 아니라 검증 계약의 일부다. 근사 간선을 실선으로 그리거나,
stale 노드에 checked 테두리를 남기는 것은 기능 오류로 취급한다.

## 10. 정직성 규칙

- “Lean 파일이 실행됐다”, “이 선언을 커널이 확인했다”, “무가정의 닫힌
  증명이다”는 서로 다른 문장이다.
- 최종 노드가 `checked`여도 axiom 폐포에 `sorryAx`나 conjectural axiom이
  있으면 닫힌 증명으로 보고하지 않는다.
- 원본 게이트 성공만으로 노드 상태를 일괄 변경하지 않는다.
- `source-approx` 간선을 실제 의존성이라고 인용하지 않는다.
- 진행 상황은 열린 노드, 신뢰 근거, 간선 근거를 함께 보고한다.
- `verified-closed`는 `kernel=checked`, `source=proved`, `trust=closed`이고
  전이적 `sorryAx` 의존이 없으며 trust 근거가 `kernel-exact`일 때만
  성립한다. UI 증거도 현재 소스에 유효하여 stale이 아니어야 한다.

## 11. 현재 범위와 다음 단계

현재 버전은 단일 파일의 주요 선언과 네임스페이스를 다룬다. 다음 항목은 아직
제한적이다.

1. `mutual`, `inductive`, `structure`가 생성하는 다수의 내부 선언
2. escaped identifier와 복잡한 매크로 선언 경계
3. import된 모듈 내부를 펼친 다중 파일 그래프
4. 커밋별 검증 스냅샷과 열린 과제 시계열
5. 비형식 주장과 Lean 선언의 연결 및 의미 검토 상태

이 확장에서도 순서 불변식은 유지한다. 새 문법을 먼저 그래프의 안정된 노드
정체성으로 표현한 뒤, 그 노드를 Lean에 질의하고, 그 결과만 시각 상태에 반영한다.
