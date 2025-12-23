import { jsxs, Fragment, jsx } from "react/jsx-runtime";
import { useForm, Head, Link } from "@inertiajs/react";
import { Box, Container, Stack, Group, Button, Alert, Card, Text, Title, TextInput, Textarea, Checkbox } from "@mantine/core";
import { IconArrowLeft, IconAlertCircle } from "@tabler/icons-react";
function Create({ existingBookmark, prefill }) {
  const { data, setData, post, processing, errors } = useForm({
    url: prefill.url,
    title: prefill.title,
    description: prefill.description,
    share_social: false
  });
  const handleSubmit = (e) => {
    e.preventDefault();
    post("/admin/bookmarks");
  };
  if (existingBookmark) {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Head, { title: "Bookmark Exists" }),
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
        /* @__PURE__ */ jsx(
          Alert,
          {
            icon: /* @__PURE__ */ jsx(IconAlertCircle, { size: 16 }),
            title: "Bookmark Already Exists",
            color: "yellow",
            children: "This URL has already been bookmarked."
          }
        ),
        /* @__PURE__ */ jsx(Card, { withBorder: true, p: "lg", children: /* @__PURE__ */ jsxs(Stack, { gap: "md", children: [
          /* @__PURE__ */ jsx(Text, { fw: 500, children: existingBookmark.title }),
          /* @__PURE__ */ jsx(Text, { size: "sm", c: "dimmed", children: existingBookmark.url }),
          existingBookmark.description && /* @__PURE__ */ jsx(Text, { size: "sm", children: existingBookmark.description }),
          /* @__PURE__ */ jsxs(Group, { children: [
            /* @__PURE__ */ jsx(
              Button,
              {
                component: Link,
                href: `/admin/bookmarks/${existingBookmark.short_url}/edit`,
                children: "Edit Bookmark"
              }
            ),
            /* @__PURE__ */ jsx(
              Button,
              {
                component: "a",
                href: existingBookmark.url,
                target: "_blank",
                variant: "light",
                children: "Visit URL"
              }
            )
          ] })
        ] }) })
      ] }) }) })
    ] });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Head, { title: "Add Bookmark" }),
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
      /* @__PURE__ */ jsx(Title, { order: 1, children: "Add Bookmark" }),
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
        /* @__PURE__ */ jsx(
          Checkbox,
          {
            label: "Share to social media",
            checked: data.share_social,
            onChange: (e) => setData(
              "share_social",
              e.currentTarget.checked
            )
          }
        ),
        /* @__PURE__ */ jsx(Button, { type: "submit", loading: processing, children: "Save Bookmark" })
      ] }) }) })
    ] }) }) })
  ] });
}
export {
  Create as default
};
