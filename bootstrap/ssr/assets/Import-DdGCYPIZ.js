import { jsxs, Fragment, jsx } from "react/jsx-runtime";
import { Head, Link, router } from "@inertiajs/react";
import { Box, Container, Stack, Group, Button, Title, Text, Alert, Card, FileInput, Progress } from "@mantine/core";
import { IconArrowLeft, IconAlertCircle, IconCheck, IconUpload } from "@tabler/icons-react";
import { useState } from "react";
function Import({ result }) {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(null);
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!file) return;
    router.post(
      "/admin/import",
      { file },
      {
        forceFormData: true,
        onStart: () => setProcessing(true),
        onFinish: () => {
          setProcessing(false);
          setProgress(null);
        },
        onProgress: (event) => {
          if (event?.percentage) {
            setProgress(event.percentage);
          }
        }
      }
    );
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Head, { title: "Import Bookmarks" }),
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
      /* @__PURE__ */ jsx(Title, { order: 1, children: "Import Bookmarks" }),
      /* @__PURE__ */ jsx(Text, { c: "dimmed", children: "Import bookmarks from a Shaarli HTML export file (Netscape bookmark format)." }),
      result && /* @__PURE__ */ jsx(
        Alert,
        {
          icon: result.errors.length > 0 ? /* @__PURE__ */ jsx(IconAlertCircle, { size: 16 }) : /* @__PURE__ */ jsx(IconCheck, { size: 16 }),
          color: result.errors.length > 0 ? "yellow" : "green",
          title: "Import Complete",
          children: /* @__PURE__ */ jsxs(Stack, { gap: "xs", children: [
            /* @__PURE__ */ jsxs(Text, { size: "sm", children: [
              "Successfully imported ",
              result.imported,
              " ",
              "bookmarks.",
              result.skipped > 0 && ` Skipped ${result.skipped} duplicates.`
            ] }),
            result.errors.length > 0 && /* @__PURE__ */ jsxs(Text, { size: "sm", c: "red", children: [
              result.errors.length,
              " errors occurred during import."
            ] })
          ] })
        }
      ),
      /* @__PURE__ */ jsx(Card, { withBorder: true, p: "xl", children: /* @__PURE__ */ jsx("form", { onSubmit: handleSubmit, children: /* @__PURE__ */ jsxs(Stack, { gap: "md", children: [
        /* @__PURE__ */ jsx(
          FileInput,
          {
            label: "Shaarli Export File",
            description: "Select an HTML file exported from Shaarli",
            placeholder: "Click to select file",
            accept: ".html,.htm",
            value: file,
            onChange: setFile,
            leftSection: /* @__PURE__ */ jsx(IconUpload, { size: 16 }),
            required: true
          }
        ),
        progress !== null && /* @__PURE__ */ jsx(Progress, { value: progress, animated: true }),
        /* @__PURE__ */ jsx(
          Button,
          {
            type: "submit",
            loading: processing,
            disabled: !file,
            leftSection: /* @__PURE__ */ jsx(IconUpload, { size: 16 }),
            children: "Import Bookmarks"
          }
        )
      ] }) }) }),
      /* @__PURE__ */ jsx(Card, { withBorder: true, p: "lg", children: /* @__PURE__ */ jsxs(Stack, { gap: "sm", children: [
        /* @__PURE__ */ jsx(Title, { order: 4, children: "How to export from Shaarli" }),
        /* @__PURE__ */ jsxs(Text, { size: "sm", c: "dimmed", children: [
          "1. Go to your Shaarli instance",
          /* @__PURE__ */ jsx("br", {}),
          "2. Navigate to Tools → Export",
          /* @__PURE__ */ jsx("br", {}),
          '3. Select "Export all" and click "Export"',
          /* @__PURE__ */ jsx("br", {}),
          "4. Save the HTML file and upload it here"
        ] })
      ] }) })
    ] }) }) })
  ] });
}
export {
  Import as default
};
