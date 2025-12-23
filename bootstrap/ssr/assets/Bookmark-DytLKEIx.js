import { jsxs, Fragment, jsx } from "react/jsx-runtime";
import { Head, Link } from "@inertiajs/react";
import { Box, Container, Stack, Group, Button, Card, Title, Badge, Text } from "@mantine/core";
import { IconArrowLeft, IconExternalLink } from "@tabler/icons-react";
function BookmarkPage({ bookmark, auth }) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Head, { title: bookmark.title }),
    /* @__PURE__ */ jsx(Box, { bg: "var(--mantine-color-body)", mih: "100vh", py: "xl", children: /* @__PURE__ */ jsx(Container, { size: "md", children: /* @__PURE__ */ jsxs(Stack, { gap: "lg", children: [
      /* @__PURE__ */ jsx(Group, { children: /* @__PURE__ */ jsx(
        Button,
        {
          component: Link,
          href: "/",
          variant: "subtle",
          leftSection: /* @__PURE__ */ jsx(IconArrowLeft, { size: 16 }),
          children: "All Bookmarks"
        }
      ) }),
      /* @__PURE__ */ jsx(Card, { withBorder: true, p: "xl", children: /* @__PURE__ */ jsxs(Stack, { gap: "md", children: [
        /* @__PURE__ */ jsx(Title, { order: 2, children: bookmark.title }),
        /* @__PURE__ */ jsxs(Group, { gap: "xs", children: [
          /* @__PURE__ */ jsx(Badge, { size: "sm", variant: "light", children: new URL(bookmark.url).hostname }),
          /* @__PURE__ */ jsx(Text, { size: "sm", c: "dimmed", children: new Date(
            bookmark.created_at
          ).toLocaleDateString() })
        ] }),
        bookmark.description && /* @__PURE__ */ jsx(Text, { children: bookmark.description }),
        /* @__PURE__ */ jsxs(Group, { children: [
          /* @__PURE__ */ jsx(
            Button,
            {
              component: "a",
              href: bookmark.url,
              target: "_blank",
              rel: "noopener noreferrer",
              leftSection: /* @__PURE__ */ jsx(IconExternalLink, { size: 16 }),
              children: "Visit Link"
            }
          ),
          auth.user && /* @__PURE__ */ jsx(
            Button,
            {
              component: Link,
              href: `/admin/bookmarks/${bookmark.short_url}/edit`,
              variant: "light",
              children: "Edit"
            }
          )
        ] })
      ] }) })
    ] }) }) })
  ] });
}
export {
  BookmarkPage as default
};
