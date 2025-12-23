import { jsxs, Fragment, jsx } from "react/jsx-runtime";
import { Head, Link, router } from "@inertiajs/react";
import { Box, Container, Stack, Group, Title, Button, TextInput, Card, Text, Table, Badge, ActionIcon, Menu, Pagination } from "@mantine/core";
import { IconPlus, IconSearch, IconExternalLink, IconDotsVertical, IconEdit, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
function Index({ bookmarks, search }) {
  const [searchValue, setSearchValue] = useState(search || "");
  const handleSearch = (e) => {
    e.preventDefault();
    router.get(
      "/admin/bookmarks",
      { q: searchValue || void 0 },
      { preserveState: true }
    );
  };
  const handleDelete = (bookmark) => {
    if (confirm("Are you sure you want to delete this bookmark?")) {
      router.delete(`/admin/bookmarks/${bookmark.short_url}`);
    }
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Head, { title: "Bookmarks" }),
    /* @__PURE__ */ jsx(Box, { bg: "var(--mantine-color-body)", mih: "100vh", py: "xl", children: /* @__PURE__ */ jsx(Container, { size: "lg", children: /* @__PURE__ */ jsxs(Stack, { gap: "lg", children: [
      /* @__PURE__ */ jsxs(Group, { justify: "space-between", align: "center", children: [
        /* @__PURE__ */ jsx(Title, { order: 1, children: "Bookmarks" }),
        /* @__PURE__ */ jsxs(Group, { children: [
          /* @__PURE__ */ jsx(
            Button,
            {
              component: Link,
              href: "/admin/bookmarks/create",
              leftSection: /* @__PURE__ */ jsx(IconPlus, { size: 16 }),
              children: "Add Bookmark"
            }
          ),
          /* @__PURE__ */ jsx(
            Button,
            {
              component: Link,
              href: "/admin/dashboard",
              variant: "light",
              children: "Dashboard"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx("form", { onSubmit: handleSearch, children: /* @__PURE__ */ jsx(
        TextInput,
        {
          placeholder: "Search bookmarks...",
          value: searchValue,
          onChange: (e) => setSearchValue(e.target.value),
          leftSection: /* @__PURE__ */ jsx(IconSearch, { size: 16 })
        }
      ) }),
      bookmarks.data.length === 0 ? /* @__PURE__ */ jsx(Card, { withBorder: true, p: "xl", children: /* @__PURE__ */ jsx(Text, { c: "dimmed", ta: "center", children: search ? "No bookmarks found matching your search." : "No bookmarks yet. Add your first one!" }) }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Card, { withBorder: true, p: 0, children: /* @__PURE__ */ jsxs(Table, { striped: true, highlightOnHover: true, children: [
          /* @__PURE__ */ jsx(Table.Thead, { children: /* @__PURE__ */ jsxs(Table.Tr, { children: [
            /* @__PURE__ */ jsx(Table.Th, { children: "Title" }),
            /* @__PURE__ */ jsx(Table.Th, { children: "URL" }),
            /* @__PURE__ */ jsx(Table.Th, { children: "Created" }),
            /* @__PURE__ */ jsx(Table.Th, { w: 50 })
          ] }) }),
          /* @__PURE__ */ jsx(Table.Tbody, { children: bookmarks.data.map((bookmark) => /* @__PURE__ */ jsxs(Table.Tr, { children: [
            /* @__PURE__ */ jsx(Table.Td, { children: /* @__PURE__ */ jsx(
              Text,
              {
                fw: 500,
                lineClamp: 1,
                children: bookmark.title
              }
            ) }),
            /* @__PURE__ */ jsx(Table.Td, { children: /* @__PURE__ */ jsxs(Group, { gap: "xs", children: [
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
              /* @__PURE__ */ jsx(
                ActionIcon,
                {
                  component: "a",
                  href: bookmark.url,
                  target: "_blank",
                  size: "xs",
                  variant: "subtle",
                  children: /* @__PURE__ */ jsx(
                    IconExternalLink,
                    {
                      size: 12
                    }
                  )
                }
              )
            ] }) }),
            /* @__PURE__ */ jsx(Table.Td, { children: /* @__PURE__ */ jsx(
              Text,
              {
                size: "sm",
                c: "dimmed",
                children: new Date(
                  bookmark.created_at
                ).toLocaleDateString()
              }
            ) }),
            /* @__PURE__ */ jsx(Table.Td, { children: /* @__PURE__ */ jsxs(
              Menu,
              {
                shadow: "md",
                width: 150,
                children: [
                  /* @__PURE__ */ jsx(Menu.Target, { children: /* @__PURE__ */ jsx(ActionIcon, { variant: "subtle", children: /* @__PURE__ */ jsx(
                    IconDotsVertical,
                    {
                      size: 16
                    }
                  ) }) }),
                  /* @__PURE__ */ jsxs(Menu.Dropdown, { children: [
                    /* @__PURE__ */ jsx(
                      Menu.Item,
                      {
                        component: Link,
                        href: `/admin/bookmarks/${bookmark.short_url}/edit`,
                        leftSection: /* @__PURE__ */ jsx(
                          IconEdit,
                          {
                            size: 14
                          }
                        ),
                        children: "Edit"
                      }
                    ),
                    /* @__PURE__ */ jsx(
                      Menu.Item,
                      {
                        color: "red",
                        leftSection: /* @__PURE__ */ jsx(
                          IconTrash,
                          {
                            size: 14
                          }
                        ),
                        onClick: () => handleDelete(
                          bookmark
                        ),
                        children: "Delete"
                      }
                    )
                  ] })
                ]
              }
            ) })
          ] }, bookmark.id)) })
        ] }) }),
        bookmarks.last_page > 1 && /* @__PURE__ */ jsx(Group, { justify: "center", children: /* @__PURE__ */ jsx(
          Pagination,
          {
            total: bookmarks.last_page,
            value: bookmarks.current_page,
            onChange: (page) => {
              router.get(
                "/admin/bookmarks",
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
