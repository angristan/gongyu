import { jsxs, Fragment, jsx } from "react/jsx-runtime";
import { useForm, Head } from "@inertiajs/react";
import { Box, Container, Stack, Title, Text, Card, TextInput, PasswordInput, Checkbox, Button, Anchor } from "@mantine/core";
function Login() {
  const { data, setData, post, processing, errors } = useForm({
    email: "",
    password: "",
    remember: false
  });
  const handleSubmit = (e) => {
    e.preventDefault();
    post("/login");
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Head, { title: "Login" }),
    /* @__PURE__ */ jsx(Box, { bg: "var(--mantine-color-body)", mih: "100vh", py: "xl", children: /* @__PURE__ */ jsx(Container, { size: "xs", children: /* @__PURE__ */ jsxs(Stack, { gap: "lg", children: [
      /* @__PURE__ */ jsxs(Stack, { gap: "xs", ta: "center", children: [
        /* @__PURE__ */ jsx(Title, { order: 1, children: "Gongyu" }),
        /* @__PURE__ */ jsx(Text, { c: "dimmed", children: "Sign in to your account" })
      ] }),
      /* @__PURE__ */ jsx(Card, { withBorder: true, p: "xl", children: /* @__PURE__ */ jsx("form", { onSubmit: handleSubmit, children: /* @__PURE__ */ jsxs(Stack, { gap: "md", children: [
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
          Checkbox,
          {
            label: "Remember me",
            checked: data.remember,
            onChange: (e) => setData(
              "remember",
              e.currentTarget.checked
            )
          }
        ),
        /* @__PURE__ */ jsx(
          Button,
          {
            type: "submit",
            loading: processing,
            fullWidth: true,
            children: "Sign In"
          }
        )
      ] }) }) }),
      /* @__PURE__ */ jsx(Text, { ta: "center", size: "sm", c: "dimmed", children: /* @__PURE__ */ jsx(Anchor, { href: "/", children: "← Back to home" }) })
    ] }) }) })
  ] });
}
export {
  Login as default
};
