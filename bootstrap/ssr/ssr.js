import { jsx } from "react/jsx-runtime";
import { createInertiaApp } from "@inertiajs/react";
import createServer from "@inertiajs/react/server";
import { createTheme, MantineProvider } from "@mantine/core";
import ReactDOMServer from "react-dom/server";
async function resolvePageComponent(path, pages) {
  for (const p of Array.isArray(path) ? path : [path]) {
    const page = pages[p];
    if (typeof page === "undefined") {
      continue;
    }
    return typeof page === "function" ? page() : page;
  }
  throw new Error(`Page not found: ${path}`);
}
const appName = "Laravel";
const theme = createTheme({
  primaryColor: "blue",
  colors: {
    dark: [
      "#C9C9C9",
      "#B8B8B8",
      "#828282",
      "#696969",
      "#424242",
      "#3B3B3B",
      "#2E2E2E",
      "#242424",
      "#1F1F1F",
      "#141414"
    ]
  }
});
createServer(
  (page) => createInertiaApp({
    page,
    render: ReactDOMServer.renderToString,
    title: (title) => title ? `${title} - ${appName}` : appName,
    resolve: (name) => resolvePageComponent(
      `./Pages/${name}.tsx`,
      /* @__PURE__ */ Object.assign({ "./Pages/Admin/Bookmarks/Create.tsx": () => import("./assets/Create-BxfkCfMP.js"), "./Pages/Admin/Bookmarks/Edit.tsx": () => import("./assets/Edit-C0aB8Jjr.js"), "./Pages/Admin/Bookmarks/Index.tsx": () => import("./assets/Index-DdPejTr2.js"), "./Pages/Admin/Dashboard.tsx": () => import("./assets/Dashboard-DYza9SfM.js"), "./Pages/Admin/Import.tsx": () => import("./assets/Import-DdGCYPIZ.js"), "./Pages/Admin/Settings/Index.tsx": () => import("./assets/Index-Cy_yRj9R.js"), "./Pages/Auth/Login.tsx": () => import("./assets/Login-BHUijZRW.js"), "./Pages/Auth/Setup.tsx": () => import("./assets/Setup-CEw5OYIC.js"), "./Pages/Bookmarklet.tsx": () => import("./assets/Bookmarklet-cukYBF1s.js"), "./Pages/Public/Bookmark.tsx": () => import("./assets/Bookmark-DytLKEIx.js"), "./Pages/Public/Index.tsx": () => import("./assets/Index-BvTYx2WN.js") })
    ),
    setup: ({ App, props }) => /* @__PURE__ */ jsx(MantineProvider, { theme, defaultColorScheme: "auto", children: /* @__PURE__ */ jsx(App, { ...props }) })
  })
);
