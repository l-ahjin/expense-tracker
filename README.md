# Expense Tracker

엑셀 거래 내역을 가져와 자동 분류하고, 대시보드로 흐름을 확인할 수 있는 데스크톱 가계부 앱입니다.

## 핵심 가치

- 빠른 기록 반영: 엑셀 데이터를 바로 가져와 거래 내역으로 변환
- 자동 분류 효율화: 키워드 규칙으로 카테고리 자동 분류
- 정확한 정산 관리: 카테고리 `차감` 정책으로 실사용 흐름에 맞는 집계
- 한눈에 보는 흐름: 대시보드에서 월별 수입/지출/결산 확인
- 외부 연동 확장성: 구글 스프레드시트 동기화 지원

## 주요 기능
- 대시보드
- 거래 내역 관리
- 엑셀 가져오기
- 금융사별 파서 템플릿 관리
- 카테고리 자동 분류(키워드 규칙)
- 카테고리/자산 관리
- 구글 스프레드시트 동기화
- 백업/복원/초기화

## 기술 스택
- Electron
- React
- Vite
- SQLite(`better-sqlite3`)
- Tailwind CSS + shadcn/ui

## 프로젝트 설정

### 설치

```bash
$ npm install
```

### 개발

```bash
$ npm run dev
```

### 빌드

```bash
# For windows
$ npm run build:win
$ npm run build:win64

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## 데이터 저장 위치
- macOS: `~/Library/Application Support/ExpenseTracker`
- Windows: `%APPDATA%/ExpenseTracker`