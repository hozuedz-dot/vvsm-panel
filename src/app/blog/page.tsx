import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { BlogListView } from "@/components/BlogViews";

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  const rows = await db.select().from(posts).where(eq(posts.published, true)).orderBy(desc(posts.createdAt));
  return <BlogListView posts={rows.map((p) => ({ slug: p.slug, title: p.title, excerpt: p.excerpt, body: p.body, lang: p.lang, createdAt: p.createdAt.toISOString() }))} />;
}
