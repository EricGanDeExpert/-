import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { convertScript } from "@/lib/script";
import { env } from "@/lib/env";

type Section = { h: string; p: string[] };

function content(days: number): Record<"zh" | "en", { title: string; updated: string; sections: Section[] }> {
  return {
    zh: {
      title: "私隱政策",
      updated: "最後更新：2026 年 10 月",
      sections: [
        {
          h: "簡單來說",
          p: [
            "字清只用你上傳的照片做一件事：把學生的手寫字轉成文字給你。我們不會把學生資料用於任何其他用途，不會出售，不會用來訓練模型，也不會用於廣告。",
          ],
        },
        {
          h: "我們儲存甚麼",
          p: [
            "你的帳戶：電郵地址、介面語言及設定。",
            "你建立的班級和學生名單（只有名字及學號，由你輸入）。",
            "你上傳的作業照片，以及轉錄出來的文字和你的修改。",
            "每月使用的頁數（用於免費額度）。付款由 Whop 處理，我們不會接觸你的信用卡資料。",
          ],
        },
        {
          h: "照片會自動刪除",
          p: [
            `原圖預設在上傳後 ${days} 天自動刪除，你可以在「設定」中更改保留天數（1–365 天）。轉錄文字會保留，直到你刪除。`,
            "你可以隨時刪除任何一份作業——照片和文字會立即永久刪除。你也可以在「設定」中一鍵刪除所有作業。",
          ],
        },
        {
          h: "誰可以看到",
          p: [
            "只有你。每位老師的資料都以資料庫權限（Row Level Security）隔離，照片存放在私人儲存空間，只能透過短時效的簽名連結查看。",
            "為了轉錄，照片會經加密連線傳送給 Anthropic 的 Claude API 處理。根據 Anthropic 的商業條款，經 API 傳送的內容不會被用作訓練模型。",
          ],
        },
        {
          h: "服務供應商",
          p: [
            "Supabase（登入、資料庫、照片儲存）、Anthropic（手寫辨識）、Whop（付款）、Vercel（網站寄存）。他們只會按我們的指示處理資料。",
          ],
        },
        {
          h: "給學校及老師的提示",
          p: [
            "請按學校的政策取得所需同意後才上傳學生作業。如不需要，避免拍下學生的全名或其他個人資料。",
            "如有任何問題或要求刪除帳戶，請聯絡我們。",
          ],
        },
      ],
    },
    en: {
      title: "Privacy policy",
      updated: "Last updated: October 2026",
      sections: [
        {
          h: "In short",
          p: [
            "Ziqing uses the photos you upload for one thing only: turning students' handwriting into text for you. Student data is never used for anything else — not sold, not used to train models, not used for advertising.",
          ],
        },
        {
          h: "What we store",
          p: [
            "Your account: email address, interface language and settings.",
            "Classes and rosters you create (names and student numbers you enter).",
            "Photos of student work you upload, the transcribed text, and your edits.",
            "Pages used per month (for the free tier). Payments are handled by Whop; we never see your card details.",
          ],
        },
        {
          h: "Photos are deleted automatically",
          p: [
            `Photos are deleted ${days} days after upload by default; you can change this in Settings (1–365 days). Transcribed text is kept until you delete it.`,
            "You can delete any submission at any time — the photo and text are permanently removed immediately. Settings also has a one-tap “delete all my work”.",
          ],
        },
        {
          h: "Who can see it",
          p: [
            "Only you. Each teacher's data is isolated with database row-level security; photos live in private storage and are only viewable through short-lived signed links.",
            "To transcribe, photos are sent over an encrypted connection to Anthropic's Claude API. Under Anthropic's commercial terms, API inputs are not used to train models.",
          ],
        },
        {
          h: "Service providers",
          p: ["Supabase (sign-in, database, photo storage), Anthropic (handwriting recognition), Whop (payments), Vercel (hosting). They process data only on our instructions."],
        },
        {
          h: "A note for schools and teachers",
          p: [
            "Please follow your school's policy and obtain any required consent before uploading student work. Where possible, avoid photographing students' full names or other personal details.",
            "Contact us with any questions or to request account deletion.",
          ],
        },
      ],
    },
  };
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  const c = content(env.defaultRetentionDays)[locale === "en" ? "en" : "zh"];
  const tx = (s: string) => (locale === "zh-Hans" ? convertScript(s, "simplified") : s);

  return (
    <article className="mx-auto max-w-2xl space-y-6 py-4">
      <Link href="/" className="text-sm text-stone-500">
        ← 字清
      </Link>
      <h1 className="text-2xl font-semibold">{tx(c.title)}</h1>
      <p className="text-xs text-stone-500">{tx(c.updated)}</p>
      {c.sections.map((s) => (
        <section key={s.h} className="space-y-2">
          <h2 className="font-semibold">{tx(s.h)}</h2>
          {s.p.map((p, i) => (
            <p key={i} className="text-sm leading-relaxed text-stone-700">
              {tx(p)}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
