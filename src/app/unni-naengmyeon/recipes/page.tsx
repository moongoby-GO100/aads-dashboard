import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import RecipePrintActions from "./RecipePrintActions";
import styles from "./page.module.css";

const BRAND_LOGO = "/brands/unni-naengmyeon/bowlcut-logo-concepts-20260722/concept-h-wordmark-noodles.png";
const WATER_MENU_IMAGE = "/brands/unni-naengmyeon/menu/nas-water-naengmyeon.jpg";
const BIBIM_MENU_IMAGE = "/brands/unni-naengmyeon/menu/nas-bibim-bul-naengmyeon.jpg";
const POLLACK_MENU_IMAGE = "/brands/unni-naengmyeon/menu/nas-pollack-naengmyeon.jpg";
const MUKSABAL_IMAGE = "/brands/unni-naengmyeon/menu/nas-muksabal.jpg";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
const FOOD_BIZ_HOST = "fb.newtalk.kr";
const FOOD_BIZ_LOGIN_URL = "https://fb.newtalk.kr/static/apps/yeoljeong-finance/index.html?redirect=/unni-naengmyeon/recipes";
const FOOD_BIZ_RECIPE_URL = "https://fb.newtalk.kr/unni-naengmyeon/recipes";
const FOOD_BIZ_HOME_URL = "https://fb.newtalk.kr/apps/yeoljeong-finance/index.html";
const FOOD_BIZ_TENANT_SLUG = "yeoljeong-gukbap";

export const metadata: Metadata = {
  metadataBase: new URL("https://fb.newtalk.kr"),
  title: "언니냉면 조리법 | 레시피 가이드",
  description: "언니냉면 성신여대점의 면 삶기, 냉면, 묵사발, 사이드 메뉴 조리 기준입니다.",
  alternates: { canonical: "/unni-naengmyeon/recipes" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f45d48",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

type StepRecipe = {
  title: string;
  image?: string;
  note?: string;
  steps: string[];
};

type AuthUser = {
  tenant?: {
    slug?: string;
    name?: string;
    kind?: string;
    status?: string;
  } | null;
  membership?: {
    role?: string;
    status?: string;
  } | null;
  tenant_role?: string | null;
};

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function hasFoodBizRecipeAccess(user: AuthUser) {
  const tenant = user.tenant;
  const membership = user.membership;
  const tenantSlug = String(tenant?.slug || "").toLowerCase();
  const tenantName = String(tenant?.name || "");
  const tenantKind = String(tenant?.kind || "").toLowerCase();
  const tenantStatus = String(tenant?.status || "").toLowerCase();
  const membershipStatus = String(membership?.status || "").toLowerCase();
  const role = String(user.tenant_role || membership?.role || "").toLowerCase();

  const isFoodBizTenant = tenantSlug === FOOD_BIZ_TENANT_SLUG || (
    tenantKind === "customer" && tenantName.includes("열정국밥")
  );
  const isActive = tenantStatus === "active" && membershipStatus === "active";
  const hasStaffRole = ["owner", "admin", "member"].includes(role);

  return isFoodBizTenant && isActive && hasStaffRole;
}

async function requireFoodBizRecipeAccess() {
  const hostname = ((await headers()).get("host") || "").split(":")[0].toLowerCase();
  if (hostname && hostname !== FOOD_BIZ_HOST && !isLocalHost(hostname)) {
    redirect(FOOD_BIZ_RECIPE_URL);
  }

  const token = (await cookies()).get("fb_access_token")?.value;
  if (!token) {
    redirect(FOOD_BIZ_LOGIN_URL);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    redirect(FOOD_BIZ_LOGIN_URL);
  }

  if (!response.ok) {
    redirect(FOOD_BIZ_LOGIN_URL);
  }

  const user = await response.json();
  if (!hasFoodBizRecipeAccess(user)) {
    redirect(FOOD_BIZ_HOME_URL);
  }
}

const noodleSteps = [
  "찬물에 면을 한번 씻어서 삶는다.",
  "해면기에 1분 30초 삶는다. 삶을 때 채망을 중간중간 몇 번 흔들어준다.",
  "찬물 흐르는 물에 30초~1분 정도 충분히 빨아준다.",
  "물기를 꽉 짜서 육수에 한번 버무린 후 다시 꽉 짜서 용기에 담는다.",
];

const mainRecipes: StepRecipe[] = [
  {
    title: "물냉면",
    image: WATER_MENU_IMAGE,
    steps: [
      "면에 육수를 묻혀서 국물을 짜고 용기에 펼쳐 담는다.",
      "다대기 30g을 올린다.",
      "토핑은 달걀 반쪽, 무김치, 오이, 깨가루, 땅콩가루 순서로 예쁘게 올린다.",
      "육수 500cc를 붓는다.",
    ],
  },
  {
    title: "비빔냉면",
    image: BIBIM_MENU_IMAGE,
    steps: [
      "면에 육수 1스푼을 충분히 묻힌 뒤 국물을 짜서 용기에 담는다.",
      "참기름을 4바퀴 정도 뿌리고 비벼준다.",
      "다대기 150g을 넣는다.",
      "토핑은 달걀 반쪽, 무김치, 오이, 깨가루, 땅콩가루 순서로 예쁘게 올린다.",
      "육수 1통 400cc를 함께 제공한다.",
    ],
  },
  {
    title: "언니냉면",
    image: WATER_MENU_IMAGE,
    steps: [
      "면에 육수를 충분히 묻혀 국물을 짜서 용기에 담는다.",
      "면에 참기름을 조금 넣는다.",
      "다대기 50g을 올린다.",
      "토핑은 달걀 반쪽, 무김치, 오이, 깨가루, 땅콩가루 순서로 예쁘게 올린다.",
      "육수 500cc를 함께 제공한다.",
    ],
  },
  {
    title: "불냉면",
    image: BIBIM_MENU_IMAGE,
    note: "비빔냉면 레시피 기준",
    steps: [
      "비빔냉면 레시피를 동일하게 준비한다.",
      "캡사이신 4바퀴 또는 매운 고춧가루 2스푼을 추가한다.",
    ],
  },
  {
    title: "명태회냉면",
    image: POLLACK_MENU_IMAGE,
    steps: [
      "면에 육수를 충분히 묻혀 국물을 짜서 용기에 담는다.",
      "면에 참기름을 조금 넣는다.",
      "다대기 50g을 올린다.",
      "명태회 130g, 달걀 반쪽, 무김치, 오이, 깨가루, 땅콩가루 순서로 예쁘게 토핑한다.",
      "육수 500cc를 함께 제공한다.",
    ],
  },
  {
    title: "묵사발",
    image: MUKSABAL_IMAGE,
    steps: [
      "묵 250g을 찬물에 2번 정도 흐르는 물로 씻고 물기를 빼서 육수그릇에 담는다.",
      "육수 500cc를 냉면그릇에 담는다.",
      "냉면육수 위에 자른 김치, 오이, 김가루 듬뿍, 깨가루, 참기름 조금을 올린다.",
    ],
  },
];

const sideRecipes: StepRecipe[] = [
  { title: "등심 돈까스", steps: ["160도에서 5분 튀긴다.", "원형그릇에 담는다."] },
  { title: "전 종류", steps: ["160도에서 3분 튀긴다.", "4각 그릇에 담는다."] },
  { title: "함박스테이크", steps: ["160도에서 2분 30초 튀긴다.", "2개는 4각그릇, 4개는 원형그릇에 담는다."] },
  { title: "군만두", steps: ["160도에서 3분 튀긴다.", "4각 그릇에 담는다."] },
  { title: "찐만두", steps: ["전자렌지에 4분 조리한다.", "4각그릇에 담는다."] },
  { title: "새우", steps: ["160도에서 3분 튀긴다.", "4각 그릇에 담는다."] },
];

function RecipeCard({ recipe, index }: { recipe: StepRecipe; index: number }) {
  return (
    <article className={styles.recipeCard}>
      {recipe.image && (
        <div className={styles.recipeImage}>
          <Image src={recipe.image} alt={`${recipe.title} 조리 참고 이미지`} fill sizes="(max-width: 760px) 100vw, 360px" />
        </div>
      )}
      <div className={styles.recipeBody}>
        <span className={styles.recipeIndex}>{String(index + 1).padStart(2, "0")}</span>
        <div className={styles.recipeTitleRow}>
          <h3>{recipe.title}</h3>
          {recipe.note && <small>{recipe.note}</small>}
        </div>
        <ol>
          {recipe.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </article>
  );
}

export default async function UnniRecipePage() {
  await requireFoodBizRecipeAccess();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/unni-naengmyeon" aria-label="언니냉면 홈">
          <Image src={BRAND_LOGO} alt="언니냉면 로고" width={1254} height={1254} priority />
          <span>언니냉면</span>
        </Link>
        <nav aria-label="언니냉면 조리법 메뉴">
          <Link href="https://unni.newtalk.kr">홈</Link>
          <a href="#noodle">면삶기</a>
          <a href="#main-recipes">주메뉴</a>
          <a href="#side-recipes">사이드</a>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span>RECIPE STANDARD</span>
          <h1>언니냉면<br />조리법 가이드</h1>
          <p>면 삶기부터 냉면, 묵사발, 사이드 메뉴까지 매장 조리 기준을 한 화면에서 확인할 수 있게 정리했습니다.</p>
        </div>
        <div className={styles.heroPanel}>
          <b>기본 토핑 순서</b>
          <p>달걀 반쪽 → 무김치 → 오이 → 깨가루 → 땅콩가루</p>
          <small>토핑은 순서대로 예쁘게 올립니다.</small>
        </div>
        <RecipePrintActions />
      </section>

      <section className={styles.noodleSection} id="noodle">
        <div className={styles.sectionHeading}>
          <span>COMMON PROCESS</span>
          <h2>면삶기</h2>
        </div>
        <ol className={styles.noodleSteps}>
          {noodleSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className={styles.recipeSection} id="main-recipes">
        <div className={styles.sectionHeading}>
          <span>MAIN MENU</span>
          <h2>주메뉴 레시피</h2>
        </div>
        <div className={styles.recipeGrid}>
          {mainRecipes.map((recipe, index) => (
            <RecipeCard key={recipe.title} recipe={recipe} index={index} />
          ))}
        </div>
      </section>

      <section className={styles.recipeSection} id="side-recipes">
        <div className={styles.sectionHeading}>
          <span>SIDE MENU</span>
          <h2>사이드 메뉴 조리법</h2>
        </div>
        <div className={styles.sideGrid}>
          {sideRecipes.map((recipe, index) => (
            <RecipeCard key={recipe.title} recipe={recipe} index={index} />
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <Link href="https://unni.newtalk.kr">언니냉면 홈페이지로 돌아가기</Link>
        <span>서울특별시 성북구 동소문로 90 1층</span>
      </footer>
    </main>
  );
}
