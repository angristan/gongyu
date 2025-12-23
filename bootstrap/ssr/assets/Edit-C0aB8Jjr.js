import { jsxs, Fragment, jsx } from "react/jsx-runtime";
import { useForm, Head, Link, router } from "@inertiajs/react";
import { Box, Container, Stack, Group, Button, Title, Card, TextInput, Textarea } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
function Edit({ bookmark }) {
  const { data, setData, patch, processing, errors } = useForm({
    url: bookmark.url,
    title: bookmark.title,
    description: bookmark.description || ""
  });
  const handleSubmit = (e) => {
    e.preventDefault();
    patch(`/admin/bookmarks/${bookmark.short_url}`);
  };
  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this bookmark?")) {
      router.delete(`/admin/bookmarks/${bookmark.short_url}`);
    }
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Head, { title: "Edit Bookmark" }),
    /* @__PURE__ */ jsx(Box, { bg: "var(--mantine-color-body)", mih: "100vh", py: "xl", children: /* @__PURE__ */ jsx(Container, { size: "sm", children: /* @__PURE__ */ jsxs(Stack, { gap: "lg", children: [
      /* @__PURE__ */ jsx(Group, { children: /* @__PURE__ */ jsx(
        Button,
        {
          component: Link,
          href: "/admin/bookmarks",
          variant: "subtle",
          leftSection: /* @__PURE__ */ jsx(IconArrowLeft, { size: 16 }),
          children: "Back"
        }
      ) }),
      /* @__PURE__ */ jsx(Title, { order: 1, children: "Edit Bookmark" }),
      /* @__PURE__ */ jsx(Card, { withBorder: true, p: "xl", children: /* @__PURE__ */ jsx("form", { onSubmit: handleSubmit, children: /* @__PURE__ */ jsxs(Stack, { gap: "md", children: [
        /* @__PURE__ */ jsx(
          TextInput,
          {
            label: "URL",
            placeholder: "https://example.com/article",
            value: data.url,
            onChange: (e) => setData("url", e.target.value),
            error: errors.url,
            required: true
          }
        ),
        /* @__PURE__ */ jsx(
          TextInput,
          {
            label: "Title",
            placeholder: "Article Title",
            value: data.title,
            onChange: (e) => setData("title", e.target.value),
            error: errors.title,
            required: true
          }
        ),
        /* @__PURE__ */ jsx(
          Textarea,
          {
            label: "Description",
            placeholder: "Optional description or notes...",
            value: data.description,
            onChange: (e) => setData(
              "description",
              e.target.value
            ),
            error: errors.description,
            minRows: 3
          }
        ),
        /* @__PURE__ */ jsxs(Group, { justify: "space-between", children: [
          /* @__PURE__ */ jsx(
            Button,
            {
              type: "submit",
              loading: processing,
              children: "Save Changes"
            }
          ),
          /* @__PURE__ */ jsx(
            Button,
            {
              color: "red",
              variant: "light",
              onClick: handleDelete,
              children: "Delete"
            }
          )
        ] })
      ] }) }) })
    ] }) }) })
  ] });
}
export {
  Edit as default
};
