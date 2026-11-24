"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/i18n";
import PublicShell from "@/components/PublicShell";
import { formatDate } from "@/lib/format";

export type PostLite = { slug: string; title: string; excerpt: string; body: string; lang: string; createdAt: string };

function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p));
}

function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-4 leading-8">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        const out: ReactNode[] = [];
        lines.forEach((l, j) => {
          if (l.startsWith("## ")) out.push(<h2 key={j} className="mt-4 text-xl font-extrabold">{inline(l.slice(3))}</h2>);
          else if (l.startsWith("# ")) out.push(<h1 key={j} className="text-2xl font-extrabold">{inline(l.slice(2))}</h1>);
          else out.push(<p key={j}>{inline(l)}</p>);
        });
        return <div key={i}>{out}</div>;
      })}
    </div>
  );
}

export function BlogListView({ posts }: { posts: PostLite[] }) {
  const { t, lang } = useI18n();
  const mine = posts.filter((p) => p.lang === lang);
  const list = mine.length ? mine : posts.filter((p) => p.lang === "en");
  return (
    <PublicShell>
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl font-extrabold">{t("blog.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("blog.sub")}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {list.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="card block p-5 transition hover:-translate-y-1">
              <p className="text-xs text-muted">{formatDate(p.createdAt)}</p>
              <h2 className="mt-1.5 text-lg font-bold">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.excerpt}</p>
              <p className="mt-3 text-sm font-semibold text-accent">{t("blog.read")} →</p>
            </Link>
          ))}
          {!list.length && <p className="col-span-full py-16 text-center text-muted">{t("common.empty")}</p>}
        </div>
      </main>
    </PublicShell>
  );
}

export function BlogPostView({ post }: { post: PostLite | null }) {
  const { t } = useI18n();
  return (
    <PublicShell>
      <article className="mx-auto max-w-2xl px-4 py-10">
        <Link href="/blog" className="text-sm font-semibold text-accent">← {t("blog.back")}</Link>
        {post ? (
          <>
            <h1 className="mt-4 text-3xl font-extrabold leading-tight" dir={post.lang === "fa" ? "rtl" : "ltr"}>{post.title}</h1>
            <p className="mt-2 text-xs text-muted">{formatDate(post.createdAt)}</p>
            <div className="mt-8" dir={post.lang === "fa" ? "rtl" : "ltr"}><Markdown text={post.body} /></div>
            <div className="card mt-10 flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="font-semibold">{t("blog.cta")}</p>
              <Link href="/buy" className="btn btn-primary">{t("land.buy")}</Link>
            </div>
          </>
        ) : (
          <p className="py-20 text-center text-muted">{t("pay.notFound")}</p>
        )}
      </article>
    </PublicShell>
  );
}
