import { jsxs, Fragment, jsx } from "react/jsx-runtime";
import { Head, router } from "@inertiajs/react";
import { Box, Container, Stack, Group, Title, Anchor, Text, TextInput, Card, Badge, Pagination } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
function Index({ bookmarks, search, auth }) {
  const [searchValue, setSearchValue] = useState(search || "");
  const handleSearch = (e) => {
    e.preventDefault();
    router.get(
      "/",
      { q: searchValue || void 0 },
      { preserveState: true }
    );
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Head, { title: "Bookmarks" }),
    /* @__PURE__ */ jsx(Box, { bg: "var(--mantine-color-body)", mih: "100vh", py: "xl", children: /* @__PURE__ */ jsx(Container, { size: "md", children: /* @__PURE__ */ jsxs(Stack, { gap: "lg", children: [
      /* @__PURE__ */ jsxs(Group, { justify: "space-between", align: "center", children: [
        /* @__PURE__ */ jsx(Title, { order: 1, children: "Gongyu" }),
        auth.user ? /* @__PURE__ */ jsx(Anchor, { href: "/admin/dashboard", children: "Dashboard" }) : /* @__PURE__ */ jsx(Anchor, { href: "/login", children: "Login" })
      ] }),
      /* @__PURE__ */ jsx(Text, { c: "dimmed", children: "A simple bookmark manager" }),
      /* @__PURE__ */ jsx("form", { onSubmit: handleSearch, children: /* @__PURE__ */ jsx(
        TextInput,
        {
          placeholder: "Search bookmarks...",
          value: searchValue,
          onChange: (e) => setSearchValue(e.target.value),
          leftSection: /* @__PURE__ */ jsx(IconSearch, { size: 16 })
        }
      ) }),
      bookmarks.data.length === 0 ? /* @__PURE__ */ jsx(Card, { withBorder: true, p: "xl", children: /* @__PURE__ */ jsx(Text, { c: "dimmed", ta: "center", children: search ? "No bookmarks found matching your search." : "No bookmarks yet." }) }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Stack, { gap: "md", children: bookmarks.data.map((bookmark) => /* @__PURE__ */ jsx(
          Card,
          {
            withBorder: true,
            p: "md",
            children: /* @__PURE__ */ jsxs(Stack, { gap: "xs", children: [
              /* @__PURE__ */ jsx(
                Anchor,
                {
                  href: bookmark.url,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  fw: 500,
                  children: bookmark.title
                }
              ),
              bookmark.description && /* @__PURE__ */ jsx(Text, { size: "sm", c: "dimmed", children: bookmark.description }),
              /* @__PURE__ */ jsxs(Group, { gap: "xs", children: [
                /* @__PURE__ */ jsx(
                  Badge,
                  {
                    size: "xs",
                    variant: "light",
                    children: new URL(
                      bookmark.url
                    ).hostname
                  }
                ),
                /* @__PURE__ */ jsx(Text, { size: "xs", c: "dimmed", children: new Date(
                  bookmark.created_at
                ).toLocaleDateString() })
              ] })
            ] })
          },
          bookmark.id
        )) }),
        bookmarks.last_page > 1 && /* @__PURE__ */ jsx(Group, { justify: "center", children: /* @__PURE__ */ jsx(
          Pagination,
          {
            total: bookmarks.last_page,
            value: bookmarks.current_page,
            onChange: (page) => {
              router.get(
                "/",
                {
                  page,
                  q: search || void 0
                },
                { preserveState: true }
              );
            }
          }
        ) })
      ] })
    ] }) }) })
  ] });
}
export {
  Index as default
};
