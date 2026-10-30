# 🎼 Martestro (마르테스트로)

**Mart + Maestro · 할인 재료를 지휘하는 레시피**

우리 동네 마트의 이번 주 전단 할인 재료를 모아서 **"오늘 이 재료로 뭐 해 먹지?"** 에 답해 주는 무료 웹앱이에요.
설치 없이 링크만 열면 돼요 → **https://koonyang.github.io/martestro/**

- 📍 현재 위치(또는 동네 이름)로 주변 마트를 거리순으로 찾아요
- 🏷️ 선택한 마트의 전단 할인 재료를 보여 줘요 (행사 기간이 지난 건 자동으로 숨김)
- 🍳 할인 재료를 많이 쓰는 레시피를 절약액 순으로 추천해요 (레시피 1,000여 개)
- ✍️ 전단이 없는 동네 마트는 매장에서 본 할인 상품을 직접 적어 둘 수 있어요 (내 기기에만 저장)
- 🔄 전단 데이터는 **매일 새벽 5시(한국시간)** GitHub Actions 가 자동으로 새로 읽어 와요

> 휴대폰에서 `https` 링크로 열면 「현재 위치로 찾기」가 동작해요. 위치 권한이 싫으면 동네 이름이나 주소를 입력하면 돼요.
> 위치 정보는 주변 마트 검색(OpenStreetMap)에만 쓰고 어디에도 저장·전송하지 않아요(브라우저에만 저장).

## 데이터 출처와 자동 갱신 방식

| 마트 | 어디서 | 방식 | 믿을 만한 정도 |
|---|---|---|---|
| 이마트 | 이마트 공식 전단 페이지 (emartapp.emart.com) | 전단에 함께 실린 **텍스트**를 읽음 | 높음 — 상품명·가격·행사기간이 공식 문구 그대로 |
| 홈플러스 | 마이홈플러스 디지털 전단 「전단 상품 보기」 (my.homeplus.co.kr/digital) | 공식 상품 목록(JSON) | 높음 |
| 롯데마트 | 롯데마트GO 웹전단 「[메가통큰] 하이퍼」 (일반 매장 기준) | 전단 이미지의 **대체 텍스트**를 읽음 | 높음 — 제타플렉스·맥스 등은 전단이 달라요 |
| 탑마트(서원유통) | martmap.co.kr 이 모아 둔 탑마트 전단 이미지 (진주 호탄점 기준, 전단은 전 점포 공통) | 새 전단이 올라오면 이미지를 받아 **무료 OCR(tesseract)** 로 품목 **이름만** 읽음 | 낮음 — ⚠️ 표시. 가격은 비워 두고 전단 원본 링크를 함께 보여 줘요 |
| 코스트코 | 마트고(martgo) 집계 일부 | 자동 갱신 없음 (기간 끝나면 사라짐) | 참고용 |

- 레시피: 식품의약품안전처 **식품안전나라 「조리식품의 레시피 DB」(COOKRCP01) Open API** 983건 + 직접 작성한 기본 레시피
- 마트 위치: © OpenStreetMap 기여자 (ODbL) — 전국 슈퍼마켓·대형마트·편의점 목록을 **매주** 미리 받아 `data/marts/` 에 격자 타일로 저장. 주소 검색: Nominatim

### 내 주변 마트 찾기 (빠른 검색)
- 매주 월요일 03:30 KST 에 `scripts/build_marts.js` 가 OpenStreetMap(Overpass, 안 되면 Geofabrik 추출본 + osmium)에서 전국 마트를 받아요.
- 0.1°(약 11×9km) 격자로 나눠 `data/marts/s/<타일>.json`(마트), `data/marts/c/<타일>.json`(편의점), 전국 대형마트는 `data/marts/big.json` 한 파일로 저장해요. 비식품 가게 거르기는 이때 미리 해요.
- 앱은 내 위치 주변 타일 몇 개(수 KB)만 받아 거리 계산만 하므로 반경을 5km로 넓혀도 바로 나와요. 받은 타일은 브라우저가 캐시해요.
- 타일을 못 받으면 예전처럼 Overpass 실시간 검색으로 대신해요.

### 매일 하는 일 (`.github/workflows/update-deals.yml`)
1. 매일 05:00 KST(또는 Actions 탭에서 **Run workflow**)에 `scripts/update_deals.js` 실행
2. 마트별로 전단을 새로 읽어 `data/deals.json` 갱신
   - 어떤 마트가 실패하거나(사이트 구조 변경 등) 너무 적게 읽히면 **그 마트는 직전 데이터를 그대로 유지**
   - 행사 기간이 끝난 품목은 삭제
   - 탑마트는 전단이 바뀌었을 때만 OCR 을 돌려요 (같은 전단이면 그대로)
3. `scripts/build.js` 로 `index.html`(데이터 예비본 내장)을 다시 만들고 `test/test.js` 통과 확인
4. **실제로 바뀐 게 있을 때만** 커밋하고 GitHub Pages 에 배포

앱은 열릴 때 `data/deals.json` 을 받아 최신 데이터로 바꿔 끼우고, 못 받으면 `index.html` 에 들어 있는 예비본을 써요.
출처 탭 맨 위에 마트별 마지막 수집 상태(✅ 자동 수집 / ⚠️ 실패 → 이전 데이터)가 나와요.

## ⚠️ 알아 두세요
- 전단 가격은 **행사 기간·점포·회원/카드 조건**에 따라 달라요. 장보러 가기 전에 마트 앱이나 매장에서 꼭 확인하세요.
- 이 앱은 각 마트와 관계없는 개인 프로젝트예요. 마트 이름·상표·전단 내용의 권리는 각 회사에 있어요.
- 자동 판독(OCR)·자동 분류(어떤 재료인지 추정)는 틀릴 수 있어요.
- 마트 사이트 구조가 바뀌면 그 마트 자동 갱신이 멈출 수 있어요 (그동안은 직전 데이터 → 기간이 끝나면 비어 보임).

## 폴더 구조
```
index.html              빌드된 앱 (GitHub Pages 가 이 파일을 보여 줌)
data/deals.json         전단 할인 데이터 (매일 자동 갱신)
data/marts/             전국 마트 위치 타일 (매주 자동 갱신)
src/template.html       화면(HTML/CSS/UI 코드)
src/logic.js            재료 판별·레시피 추천 로직 (브라우저/Node 공용)
src/pub_data.js         식품안전나라 레시피 (scripts/build_pub.js 로 생성)
scripts/update_deals.js 전단 갱신 실행기
scripts/scrapers/       마트별 수집기 (emart, homeplus, lottemart, topmart)
scripts/build.js        src + data → index.html
scripts/build_marts.js  OpenStreetMap → data/marts 타일
test/                   로직 테스트(test.js), 브라우저 확인(browser/smoke.js)
```

## 직접 돌려 보기 (개발자용)
Node 18 이상, 외부 패키지 없음.
```bash
node scripts/update_deals.js   # 전단 새로 읽기 (탑마트 OCR 은 tesseract + 한국어 데이터 필요: apt install tesseract-ocr tesseract-ocr-kor)
node scripts/build.js          # index.html 만들기
node test/test.js              # 테스트
npx serve .                    # 아무 정적 서버로 열어 보기 (file:// 로 열면 내장 예비본 사용)
```
레시피 데이터를 다시 만들려면 식품안전나라 COOKRCP01 응답(JSON row 배열)을 `raw/all.json` 에 저장한 뒤 `node scripts/build_pub.js` (raw/ 는 용량이 커서 저장소에 넣지 않아요).

## 라이선스
코드는 MIT. 데이터 출처 표기는 [LICENSE](LICENSE) 참고.
