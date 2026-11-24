import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { BlogPostView } from "@/components/BlogViews";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [p] = await db.select().from(posts).where(and(eq(posts.slug, slug), eq(posts.published, true))).limit(1);
  return <BlogPostView post={p ? { slug: p.slug, title: p.title, excerpt: p.excerpt, body: p.body, lang: p.lang, createdAt: p.createdAt.toISOString() } : null} />;
}
