import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { PostForm, type PostFormInitial } from "@/components/admin/PostForm";
import { getPostAdmin, listCategories } from "@/lib/blog.functions";

export const Route = createFileRoute("/_authenticated/admin/blog/$id")({
  component: EditPostPage,
});

function EditPostPage() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getPostAdmin);
  const catFn = useServerFn(listCategories);
  const { data: post, isLoading } = useQuery({
    queryKey: ["admin-post", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => catFn(),
  });

  if (isLoading || !post) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-12 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
      </div>
    );
  }

  const initial: PostFormInitial = {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content_md: post.content_md,
    cover_image_url: post.cover_image_url,
    status: post.status,
    category_id: post.category_id,
    published_at: post.published_at,
    meta_title: post.meta_title,
    meta_description: post.meta_description,
    keyword_primary: post.keyword_primary,
    keywords_secondary: post.keywords_secondary ?? [],
    faq: (post.faq as Array<{ question: string; answer: string }>) ?? [],
    tag_ids: post.tag_ids ?? [],
    display_author_name: post.display_author_name ?? "FastProxy",
  };

  return (
    <div>
      <h3 className="text-lg font-bold mb-4">Editar post</h3>
      <PostForm initial={initial} categories={categories ?? []} />
    </div>
  );
}
