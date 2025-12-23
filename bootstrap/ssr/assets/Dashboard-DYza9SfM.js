import { jsxs, Fragment, jsx } from "react/jsx-runtime";
import { Head, Link, router } from "@inertiajs/react";
import { AreaChart, BarChart } from "@mantine/charts";
import { Box, Container, Stack, Group, Title, Button, Text, SimpleGrid, Paper, Card, SegmentedControl, Table, Badge } from "@mantine/core";
import { IconPlus, IconSettings, IconLogout, IconBookmark, IconCalendar, IconCalendarWeek } from "@tabler/icons-react";
const PERIOD_OPTIONS = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "All" }
];
function Dashboard({ stats, filters, auth }) {
  const handleLogout = () => {
    router.post("/logout");
  };
  const handlePeriodChange = (value) => {
    router.get(
      "/admin/dashboard",
      { period: value },
      { preserveState: true, preserveScroll: true }
    );
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Head, { title: "Dashboard" }),
    /* @__PURE__ */ jsx(Box, { bg: "var(--mantine-color-body)", mih: "100vh", py: "xl", children: /* @__PURE__ */ jsx(Container, { size: "lg", children: /* @__PURE__ */ jsxs(Stack, { gap: "lg", children: [
      /* @__PURE__ */ jsxs(Group, { justify: "space-between", align: "center", children: [
        /* @__PURE__ */ jsx(Title, { order: 1, children: "Dashboard" }),
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
              href: "/admin/settings",
              variant: "light",
              leftSection: /* @__PURE__ */ jsx(IconSettings, { size: 16 }),
              children: "Settings"
            }
          ),
          /* @__PURE__ */ jsx(
            Button,
            {
              variant: "subtle",
              color: "gray",
              onClick: handleLogout,
              leftSection: /* @__PURE__ */ jsx(IconLogout, { size: 16 }),
              children: "Logout"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs(Text, { c: "dimmed", children: [
        "Welcome back, ",
        auth.user?.name,
        "!"
      ] }),
      /* @__PURE__ */ jsxs(SimpleGrid, { cols: { base: 1, sm: 3 }, children: [
        /* @__PURE__ */ jsx(Paper, { withBorder: true, p: "md", radius: "md", children: /* @__PURE__ */ jsxs(Group, { justify: "space-between", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx(
              Text,
              {
                c: "dimmed",
                size: "xs",
                tt: "uppercase",
                fw: 700,
                children: "Total Bookmarks"
              }
            ),
            /* @__PURE__ */ jsx(Text, { fw: 700, size: "xl", children: stats.total_bookmarks })
          ] }),
          /* @__PURE__ */ jsx(
            IconBookmark,
            {
              size: 32,
              color: "var(--mantine-color-blue-6)"
            }
          )
        ] }) }),
        /* @__PURE__ */ jsx(Paper, { withBorder: true, p: "md", radius: "md", children: /* @__PURE__ */ jsxs(Group, { justify: "space-between", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx(
              Text,
              {
                c: "dimmed",
                size: "xs",
                tt: "uppercase",
                fw: 700,
                children: "This Month"
              }
            ),
            /* @__PURE__ */ jsx(Text, { fw: 700, size: "xl", children: stats.bookmarks_this_month })
          ] }),
          /* @__PURE__ */ jsx(
            IconCalendar,
            {
              size: 32,
              color: "var(--mantine-color-green-6)"
            }
          )
        ] }) }),
        /* @__PURE__ */ jsx(Paper, { withBorder: true, p: "md", radius: "md", children: /* @__PURE__ */ jsxs(Group, { justify: "space-between", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx(
              Text,
              {
                c: "dimmed",
                size: "xs",
                tt: "uppercase",
                fw: 700,
                children: "This Week"
              }
            ),
            /* @__PURE__ */ jsx(Text, { fw: 700, size: "xl", children: stats.bookmarks_this_week })
          ] }),
          /* @__PURE__ */ jsx(
            IconCalendarWeek,
            {
              size: 32,
              color: "var(--mantine-color-orange-6)"
            }
          )
        ] }) })
      ] }),
      /* @__PURE__ */ jsxs(Card, { withBorder: true, p: "lg", children: [
        /* @__PURE__ */ jsxs(Group, { justify: "space-between", mb: "md", children: [
          /* @__PURE__ */ jsx(Title, { order: 4, children: "Charts" }),
          /* @__PURE__ */ jsx(
            SegmentedControl,
            {
              size: "xs",
              value: filters.period,
              onChange: handlePeriodChange,
              data: PERIOD_OPTIONS
            }
          )
        ] }),
        /* @__PURE__ */ jsxs(SimpleGrid, { cols: { base: 1, md: 2 }, children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx(Text, { size: "sm", fw: 500, mb: "sm", children: "Bookmarks Over Time" }),
            stats.bookmarks_over_time.length > 0 ? /* @__PURE__ */ jsx(
              AreaChart,
              {
                h: 200,
                data: stats.bookmarks_over_time,
                dataKey: "date",
                series: [
                  { name: "count", color: "blue.6" }
                ],
                curveType: "monotone",
                withDots: false
              }
            ) : /* @__PURE__ */ jsx(Text, { c: "dimmed", ta: "center", py: "xl", children: "No data yet" })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx(Text, { size: "sm", fw: 500, mb: "sm", children: "Top Domains" }),
            stats.bookmarks_by_domain.length > 0 ? /* @__PURE__ */ jsx(
              BarChart,
              {
                h: 200,
                data: stats.bookmarks_by_domain,
                dataKey: "domain",
                series: [
                  {
                    name: "count",
                    label: "Bookmarks",
                    color: "violet.6"
                  }
                ],
                tickLine: "none"
              }
            ) : /* @__PURE__ */ jsx(Text, { c: "dimmed", ta: "center", py: "xl", children: "No data yet" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs(Card, { withBorder: true, p: "lg", children: [
        /* @__PURE__ */ jsxs(Group, { justify: "space-between", mb: "md", children: [
          /* @__PURE__ */ jsx(Title, { order: 4, children: "Recent Bookmarks" }),
          /* @__PURE__ */ jsx(
            Button,
            {
              component: Link,
              href: "/admin/bookmarks",
              variant: "subtle",
              size: "xs",
              children: "View All"
            }
          )
        ] }),
        stats.recent_bookmarks.length > 0 ? /* @__PURE__ */ jsx(Table, { children: /* @__PURE__ */ jsx(Table.Tbody, { children: stats.recent_bookmarks.map(
          (bookmark) => /* @__PURE__ */ jsxs(Table.Tr, { children: [
            /* @__PURE__ */ jsx(Table.Td, { children: /* @__PURE__ */ jsx(
              Text,
              {
                fw: 500,
                lineClamp: 1,
                children: bookmark.title
              }
            ) }),
            /* @__PURE__ */ jsx(Table.Td, { children: /* @__PURE__ */ jsx(
              Badge,
              {
                size: "xs",
                variant: "light",
                children: new URL(
                  bookmark.url
                ).hostname.replace(
                  "www.",
                  ""
                )
              }
            ) }),
            /* @__PURE__ */ jsx(Table.Td, { children: /* @__PURE__ */ jsx(
              Text,
              {
                size: "sm",
                c: "dimmed",
                children: new Date(
                  bookmark.created_at
                ).toLocaleDateString()
              }
            ) })
          ] }, bookmark.id)
        ) }) }) : /* @__PURE__ */ jsx(Text, { c: "dimmed", ta: "center", py: "xl", children: "No bookmarks yet" })
      ] }),
      /* @__PURE__ */ jsx(Card, { withBorder: true, p: "xl", children: /* @__PURE__ */ jsxs(Stack, { gap: "md", children: [
        /* @__PURE__ */ jsx(Title, { order: 4, children: "Quick Actions" }),
        /* @__PURE__ */ jsxs(Group, { children: [
          /* @__PURE__ */ jsx(
            Button,
            {
              component: Link,
              href: "/admin/bookmarks",
              variant: "light",
              children: "View All Bookmarks"
            }
          ),
          /* @__PURE__ */ jsx(
            Button,
            {
              component: Link,
              href: "/admin/import",
              variant: "light",
              children: "Import from Shaarli"
            }
          ),
          /* @__PURE__ */ jsx(
            Button,
            {
              component: Link,
              href: "/",
              variant: "subtle",
              children: "View Public Site"
            }
          )
        ] })
      ] }) })
    ] }) }) })
  ] });
}
export {
  Dashboard as default
};
