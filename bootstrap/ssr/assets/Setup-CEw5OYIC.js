import { jsxs, Fragment, jsx } from "react/jsx-runtime";
import { useForm, Head } from "@inertiajs/react";
import { Box, Container, Stack, Title, Text, Card, TextInput, PasswordInput, Button } from "@mantine/core";
function Setup() {
  const { data, setData, post, processing, errors } = useForm({
    name: "",
    email: "",
    password: "",
    password_confirmation: ""
  });
  const handleSubmit = (e) => {
    e.preventDefault();
    post("/setup");
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Head, { title: "Setup" }),
    /* @__PURE__ */ jsx(Box, { bg: "var(--mantine-color-body)", mih: "100vh", py: "xl", children: /* @__PURE__ */ jsx(Container, { size: "xs", children: /* @__PURE__ */ jsxs(Stack, { gap: "lg", children: [
      /* @__PURE__ */ jsxs(Stack, { gap: "xs", ta: "center", children: [
        /* @__PURE__ */ jsx(Title, { order: 1, children: "Welcome to Gongyu" }),
        /* @__PURE__ */ jsx(Text, { c: "dimmed", children: "Create your admin account to get started" })
      ] }),
      /* @__PURE__ */ jsx(Card, { withBorder: true, p: "xl", children: /* @__PURE__ */ jsx("form", { onSubmit: handleSubmit, children: /* @__PURE__ */ jsxs(Stack, { gap: "md", children: [
        /* @__PURE__ */ jsx(
          TextInput,
          {
            label: "Name",
            placeholder: "Your name",
            value: data.name,
            onChange: (e) => setData("name", e.target.value),
            error: errors.name,
            required: true
          }
        ),
        /* @__PURE__ */ jsx(
          TextInput,
          {
            label: "Email",
            type: "email",
            placeholder: "your@email.com",
            value: data.email,
            onChange: (e) => setData("email", e.target.value),
            error: errors.email,
            required: true
          }
        ),
        /* @__PURE__ */ jsx(
          PasswordInput,
          {
            label: "Password",
            placeholder: "••••••••",
            value: data.password,
            onChange: (e) => setData("password", e.target.value),
            error: errors.password,
            required: true
          }
        ),
        /* @__PURE__ */ jsx(
          PasswordInput,
          {
            label: "Confirm Password",
            placeholder: "••••••••",
            value: data.password_confirmation,
            onChange: (e) => setData(
              "password_confirmation",
              e.target.value
            ),
            error: errors.password_confirmation,
            required: true
          }
        ),
        /* @__PURE__ */ jsx(
          Button,
          {
            type: "submit",
            loading: processing,
            fullWidth: true,
            children: "Create Account"
          }
        )
      ] }) }) })
    ] }) }) })
  ] });
}
export {
  Setup as default
};
