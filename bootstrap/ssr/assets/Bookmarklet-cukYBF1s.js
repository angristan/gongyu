import { jsxs, Fragment, jsx } from "react/jsx-runtime";
import { useForm, Head, router } from "@inertiajs/react";
import { Box, Container, Stack, Title, Alert, Card, Text, Group, Button, TextInput, Textarea, Checkbox } from "@mantine/core";
import { IconAlertCircle, IconCheck } from "@tabler/icons-react";
import { useState } from "react";
function Bookmarklet({
  existingBookmark,
  prefill,
  source
}) {
  const [saved, setSaved] = useState(false);
  const isPopup = source === "bookmarklet";
  const { data, setData, post, processing, errors } = useForm({
    url: prefill.url,
    title: prefill.title,
    description: prefill.description,
    share_social: false
  });
  const handleSubmit = (e) => {
    e.preventDefault();
    post("/admin/bookmarks", {
      onSuccess: () => {
        setSaved(true);
        if (isPopup) {
          setTimeout(() => window.close(), 1500);
        }
      }
    });
  };
  if (existingBookmark) {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Head, { title: "Bookmark Exists" }),
      /* @__PURE__ */ jsx(Box, { bg: "var(--mantine-color-body)", mih: "100vh", py: "xl", children: /* @__PURE__ */ jsx(Container, { size: "sm", children: /* @__PURE__ */ jsxs(Stack, { gap: "lg", children: [
        /* @__PURE__ */ jsx(Title, { order: 2, children: "Bookmark Exists" }),
        /* @__PURE__ */ jsx(
          Alert,
          {
            icon: /* @__PURE__ */ jsx(IconAlertCircle, { size: 16 }),
            color: "yellow",
            children: "This URL has already been bookmarked."
          }
        ),
        /* @__PURE__ */ jsx(Card, { withBorder: true, p: "lg", children: /* @__PURE__ */ jsxs(Stack, { gap: "md", children: [
          /* @__PURE__ */ jsx(Text, { fw: 500, children: existingBookmark.title }),
          /* @__PURE__ */ jsx(Text, { size: "sm", c: "dimmed", lineClamp: 1, children: existingBookmark.url }),
          existingBookmark.description && /* @__PURE__ */ jsx(Text, { size: "sm", children: existingBookmark.description }),
          /* @__PURE__ */ jsxs(Group, { children: [
            /* @__PURE__ */ jsx(
              Button,
              {
                onClick: () => router.get(
                  `/admin/bookmarks/${existingBookmark.short_url}/edit`
                ),
                children: "Edit Bookmark"
              }
            ),
            isPopup && /* @__PURE__ */ jsx(
              Button,
              {
                variant: "light",
                onClick: () => window.close(),
                children: "Close"
              }
            )
          ] })
        ] }) })
      ] }) }) })
    ] });
  }
  if (saved) {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Head, { title: "Saved!" }),
      /* @__PURE__ */ jsx(Box, { bg: "var(--mantine-color-body)", mih: "100vh", py: "xl", children: /* @__PURE__ */ jsx(Container, { size: "sm", children: /* @__PURE__ */ jsxs(
        Stack,
        {
          gap: "lg",
          align: "center",
          justify: "center",
          mih: 200,
          children: [
            /* @__PURE__ */ jsx(
              IconCheck,
              {
                size: 48,
                color: "var(--mantine-color-green-6)"
              }
            ),
            /* @__PURE__ */ jsx(Title, { order: 2, children: "Bookmark Saved!" }),
            /* @__PURE__ */ jsx(Text, { c: "dimmed", children: isPopup ? "This window will close automatically..." : "Your bookmark has been saved." }),
            !isPopup && /* @__PURE__ */ jsx(
              Button,
              {
                onClick: () => router.get("/admin/bookmarks"),
                children: "View All Bookmarks"
              }
            )
          ]
        }
      ) }) })
    ] });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Head, { title: "Add Bookmark" }),
    /* @__PURE__ */ jsx(Box, { bg: "var(--mantine-color-body)", mih: "100vh", py: "xl", children: /* @__PURE__ */ jsx(Container, { size: "sm", children: /* @__PURE__ */ jsxs(Stack, { gap: "lg", children: [
      /* @__PURE__ */ jsx(Title, { order: 2, children: "Add Bookmark" }),
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
        /* @__PURE__ */ jsxs(Group, { children: [
          /* @__PURE__ */ jsx(
            Button,
            {
              type: "submit",
              loading: processing,
              children: "Save Bookmark"
            }
          ),
          isPopup && /* @__PURE__ */ jsx(
            Button,
            {
              variant: "light",
              onClick: () => window.close(),
              children: "Cancel"
            }
          )
        ] })
      ] }) }) })
    ] }) }) })
  ] });
}
export {
  Bookmarklet as default
};
