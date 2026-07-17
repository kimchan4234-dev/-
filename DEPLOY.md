# 🚀 Vercel 묣료 배포 가이드

이 프로젝트를 Vercel에 올리면 **영구적으로 살아있는 링크**(`https://프로젝트명.vercel.app`)를 얻을 수 있습니다. 아래 단계를 순서대로 따라하세요.

---

## 1. GitHub 저장소에 코드 업로드

이 프로젝트 폴리를 로컬 컴퓨터나 다른 환경으로 가져온 뒤, GitHub에 새 저장소(repository)를 만들고 코드를 올리세요.

```bash
git init
git add .
git commit -m "claude clone ready for deploy"
git remote add origin https://github.com/<사용자명>/claude-clone.git
git push -u origin main
```

---

## 2. Vercel 프로젝트 생성

1. [vercel.com](https://vercel.com) 접속 → GitHub 계정으로 로그인
2. 우측 상단 **"Add New"** → **"Project"** 클릭
3. 방금 만든 `claude-clone` 저장소를 찾아 **Import** 클릭
4. Vercel이 자동으로 Next.js 프로젝트를 감지합니다.

---

## 3. 데이터베이스(PostgreSQL) 연결

이 앱은 PostgreSQL이 필요합니다. Vercel에서는 묣료 PostgreSQL 서비스인 **Neon**을 바로 연결할 수 있습니다.

### 3-1. Neon 데이터베이스 생성
프로젝트 설정 화면에서:
1. 좌측 메뉴 **"Storage"** 클릭
2. **"Create Database"** 클릭 → **Neon** 선택
3. 이름 입력 → 생성 (묣료 플랜으로도 충분합니다)

생성이 끝나면 자동으로 `DATABASE_URL`이라는 환경 변수가 프로젝트에 추가됩니다. **따로 입력할 필요 없습니다.**

---

## 4. 환경 변수 주입(자동)

Neon을 연결하면 아래 변수들이 Vercel 대시보드에 자동으로 들어갑니다.
- `DATABASE_URL`
- `DIRECT_URL`

**안 되면 수동으로 입력:**
Project Settings → Environment Variables 에 아래 값 추가:
```
DATABASE_URL=postgresql://<Neon에서 복사한 연결문자열>
```

---

## 5. 배포 실행

모든 설정이 되었다면 **"Deploy"** 버튼을 누르세요.

배포가 끝나면 약 1~2분 뒤 주소가 생깁니다:
```
https://claude-clone-abc123.vercel.app
```

이제 이 링크는 **절대 죽지 않습니다.** 언제든지 접속할 수 있습니다.

---

## 6. 최초 실행 후 해야 할 일

배포가 끝난 뒤 앱에 처음 접속하면 Drizzle 스키마가 자동으로 DB에 적용되지 않을 수 있습니다. 배포 로그(`Deployments` → `Build Logs`)에서 `npm run db:push` 같은 명령어가 없다면 수동으로 스키마를 푸시해야 할 수도 있습니다.

Vercel은 이 프로젝트의 `vercel.json`이 자동으로 헬스체크를 돌리므로, 대부분은 그냥 바로 작동합니다. 하지만 대화가 저장이 안 된다면 아래 명령어를 로컬 단말기에서 한 번만 실행하세요:

```bash
npx drizzle-kit push
```

---

## 7. 커스텀 도메인 (선택)

원하는 커스텀 도메임(예: `mycoolchat.com`)이 있다면 Vercel Settings → Domains 에서 추가할 수 있습니다.

---

> 💡 **Tip:** 이 프로젝트는 `public/uploads` 폴자에 파일을 저장합니다. Vercel은 읽기 전용 루츠 파일 시스템이라 업로드한 파일은 배포 주소에서는 지워지지만, 대화 내역과 파일 메타데이터는 Neon DB에 안전하게 보존합니다.
