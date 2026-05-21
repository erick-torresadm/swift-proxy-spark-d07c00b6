import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PostForm } from "@/components/admin/PostForm";
import { listCategories } from "@/lib/blog.functions";

export const Route = createFileRoute("/_authenticated/admin/blog/new")({
  component: NewPostPage,
});

function NewPostPage() {
  const fn = useServerFn(listCategories);
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => fn(),
  });
  return (
    <div>
      <h3 className="text-lg font-bold mb-4">Novo post</h3>
      <PostForm initial={{}} categories={categories ?? []} />
    </div>
  );
}
