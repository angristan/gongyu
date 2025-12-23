import { jsxs, Fragment, jsx } from "react/jsx-runtime";
import { useForm, Head, Link } from "@inertiajs/react";
import { Box, Container, Stack, Group, Button, Title, Tabs, Card, Text, CopyButton, Tooltip, ActionIcon, Code, TextInput, PasswordInput } from "@mantine/core";
import { IconArrowLeft, IconCode, IconBrandTwitter, IconBrandMastodon, IconCloud, IconCheck, IconCopy } from "@tabler/icons-react";
import { useRef, useEffect } from "react";
function SettingsIndex({ settings, bookmarkletUrl }) {
  const { data, setData, patch, processing, errors } = useForm({
    twitter_api_key: settings.twitter_api_key || "",
    twitter_api_secret: settings.twitter_api_secret || "",
    twitter_access_token: settings.twitter_access_token || "",
    twitter_access_secret: settings.twitter_access_secret || "",
    mastodon_instance: settings.mastodon_instance || "",
    mastodon_access_token: settings.mastodon_access_token || "",
    bluesky_handle: settings.bluesky_handle || "",
    bluesky_app_password: settings.bluesky_app_password || ""
  });
  const handleSubmit = (e) => {
    e.preventDefault();
    patch("/admin/settings");
  };
  const bookmarkletCode = `javascript:(function(){window.open('${bookmarkletUrl}?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+'&description='+encodeURIComponent(window.getSelection())+'&source=bookmarklet','gongyu','width=600,height=500');})();`;
  const bookmarkletRef = useRef(null);
  useEffect(() => {
    if (bookmarkletRef.current) {
      bookmarkletRef.current.setAttribute("href", bookmarkletCode);
    }
  }, [bookmarkletCode]);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Head, { title: "Settings" }),
    /* @__PURE__ */ jsx(Box, { bg: "var(--mantine-color-body)", mih: "100vh", py: "xl", children: /* @__PURE__ */ jsx(Container, { size: "md", children: /* @__PURE__ */ jsxs(Stack, { gap: "lg", children: [
      /* @__PURE__ */ jsx(Group, { children: /* @__PURE__ */ jsx(
        Button,
        {
          component: Link,
          href: "/admin/dashboard",
          variant: "subtle",
          leftSection: /* @__PURE__ */ jsx(IconArrowLeft, { size: 16 }),
          children: "Dashboard"
        }
      ) }),
      /* @__PURE__ */ jsx(Title, { order: 1, children: "Settings" }),
      /* @__PURE__ */ jsxs(Tabs, { defaultValue: "bookmarklet", children: [
        /* @__PURE__ */ jsxs(Tabs.List, { children: [
          /* @__PURE__ */ jsx(
            Tabs.Tab,
            {
              value: "bookmarklet",
              leftSection: /* @__PURE__ */ jsx(IconCode, { size: 16 }),
              children: "Bookmarklet"
            }
          ),
          /* @__PURE__ */ jsx(
            Tabs.Tab,
            {
              value: "twitter",
              leftSection: /* @__PURE__ */ jsx(IconBrandTwitter, { size: 16 }),
              children: "Twitter"
            }
          ),
          /* @__PURE__ */ jsx(
            Tabs.Tab,
            {
              value: "mastodon",
              leftSection: /* @__PURE__ */ jsx(IconBrandMastodon, { size: 16 }),
              children: "Mastodon"
            }
          ),
          /* @__PURE__ */ jsx(
            Tabs.Tab,
            {
              value: "bluesky",
              leftSection: /* @__PURE__ */ jsx(IconCloud, { size: 16 }),
              children: "Bluesky"
            }
          )
        ] }),
        /* @__PURE__ */ jsx(Tabs.Panel, { value: "bookmarklet", pt: "md", children: /* @__PURE__ */ jsx(Card, { withBorder: true, p: "xl", children: /* @__PURE__ */ jsxs(Stack, { gap: "md", children: [
          /* @__PURE__ */ jsx(Title, { order: 3, children: "Bookmarklet" }),
          /* @__PURE__ */ jsx(Text, { size: "sm", c: "dimmed", children: "Drag the button below to your bookmarks bar, or copy the code to create a bookmarklet manually." }),
          /* @__PURE__ */ jsxs(Group, { children: [
            /* @__PURE__ */ jsx(
              "a",
              {
                ref: bookmarkletRef,
                onClick: (e) => e.preventDefault(),
                draggable: true,
                style: {
                  padding: "8px 16px",
                  borderRadius: "var(--mantine-radius-default)",
                  backgroundColor: "var(--mantine-color-blue-filled)",
                  color: "white",
                  textDecoration: "none",
                  fontSize: "var(--mantine-font-size-sm)",
                  fontWeight: 600,
                  cursor: "grab"
                },
                children: "+ Add to Gongyu"
              }
            ),
            /* @__PURE__ */ jsx(Text, { size: "sm", c: "dimmed", children: "← Drag this to your bookmarks bar" })
          ] }),
          /* @__PURE__ */ jsxs(Stack, { gap: "xs", children: [
            /* @__PURE__ */ jsxs(Group, { justify: "space-between", children: [
              /* @__PURE__ */ jsx(Text, { size: "sm", fw: 500, children: "Bookmarklet Code" }),
              /* @__PURE__ */ jsx(
                CopyButton,
                {
                  value: bookmarkletCode,
                  children: ({ copied, copy }) => /* @__PURE__ */ jsx(
                    Tooltip,
                    {
                      label: copied ? "Copied" : "Copy",
                      children: /* @__PURE__ */ jsx(
                        ActionIcon,
                        {
                          variant: "subtle",
                          onClick: copy,
                          children: copied ? /* @__PURE__ */ jsx(
                            IconCheck,
                            {
                              size: 16
                            }
                          ) : /* @__PURE__ */ jsx(
                            IconCopy,
                            {
                              size: 16
                            }
                          )
                        }
                      )
                    }
                  )
                }
              )
            ] }),
            /* @__PURE__ */ jsx(
              Code,
              {
                block: true,
                style: {
                  wordBreak: "break-all"
                },
                children: bookmarkletCode
              }
            )
          ] })
        ] }) }) }),
        /* @__PURE__ */ jsx(Tabs.Panel, { value: "twitter", pt: "md", children: /* @__PURE__ */ jsx("form", { onSubmit: handleSubmit, children: /* @__PURE__ */ jsx(Card, { withBorder: true, p: "xl", children: /* @__PURE__ */ jsxs(Stack, { gap: "md", children: [
          /* @__PURE__ */ jsx(Title, { order: 3, children: "Twitter API" }),
          /* @__PURE__ */ jsx(Text, { size: "sm", c: "dimmed", children: "Configure Twitter API credentials to auto-share bookmarks to Twitter." }),
          /* @__PURE__ */ jsx(
            TextInput,
            {
              label: "API Key",
              placeholder: "Enter your Twitter API key",
              value: data.twitter_api_key,
              onChange: (e) => setData(
                "twitter_api_key",
                e.target.value
              ),
              error: errors.twitter_api_key
            }
          ),
          /* @__PURE__ */ jsx(
            PasswordInput,
            {
              label: "API Secret",
              placeholder: "Enter your Twitter API secret",
              value: data.twitter_api_secret,
              onChange: (e) => setData(
                "twitter_api_secret",
                e.target.value
              ),
              error: errors.twitter_api_secret
            }
          ),
          /* @__PURE__ */ jsx(
            TextInput,
            {
              label: "Access Token",
              placeholder: "Enter your Twitter access token",
              value: data.twitter_access_token,
              onChange: (e) => setData(
                "twitter_access_token",
                e.target.value
              ),
              error: errors.twitter_access_token
            }
          ),
          /* @__PURE__ */ jsx(
            PasswordInput,
            {
              label: "Access Token Secret",
              placeholder: "Enter your Twitter access token secret",
              value: data.twitter_access_secret,
              onChange: (e) => setData(
                "twitter_access_secret",
                e.target.value
              ),
              error: errors.twitter_access_secret
            }
          ),
          /* @__PURE__ */ jsx(
            Button,
            {
              type: "submit",
              loading: processing,
              children: "Save Twitter Settings"
            }
          )
        ] }) }) }) }),
        /* @__PURE__ */ jsx(Tabs.Panel, { value: "mastodon", pt: "md", children: /* @__PURE__ */ jsx("form", { onSubmit: handleSubmit, children: /* @__PURE__ */ jsx(Card, { withBorder: true, p: "xl", children: /* @__PURE__ */ jsxs(Stack, { gap: "md", children: [
          /* @__PURE__ */ jsx(Title, { order: 3, children: "Mastodon" }),
          /* @__PURE__ */ jsx(Text, { size: "sm", c: "dimmed", children: "Configure Mastodon credentials to auto-share bookmarks to your Mastodon instance." }),
          /* @__PURE__ */ jsx(
            TextInput,
            {
              label: "Instance URL",
              placeholder: "https://mastodon.social",
              value: data.mastodon_instance,
              onChange: (e) => setData(
                "mastodon_instance",
                e.target.value
              ),
              error: errors.mastodon_instance
            }
          ),
          /* @__PURE__ */ jsx(
            PasswordInput,
            {
              label: "Access Token",
              placeholder: "Enter your Mastodon access token",
              value: data.mastodon_access_token,
              onChange: (e) => setData(
                "mastodon_access_token",
                e.target.value
              ),
              error: errors.mastodon_access_token
            }
          ),
          /* @__PURE__ */ jsx(
            Button,
            {
              type: "submit",
              loading: processing,
              children: "Save Mastodon Settings"
            }
          )
        ] }) }) }) }),
        /* @__PURE__ */ jsx(Tabs.Panel, { value: "bluesky", pt: "md", children: /* @__PURE__ */ jsx("form", { onSubmit: handleSubmit, children: /* @__PURE__ */ jsx(Card, { withBorder: true, p: "xl", children: /* @__PURE__ */ jsxs(Stack, { gap: "md", children: [
          /* @__PURE__ */ jsx(Title, { order: 3, children: "Bluesky" }),
          /* @__PURE__ */ jsx(Text, { size: "sm", c: "dimmed", children: "Configure Bluesky credentials to auto-share bookmarks to Bluesky." }),
          /* @__PURE__ */ jsx(
            TextInput,
            {
              label: "Handle",
              placeholder: "yourname.bsky.social",
              value: data.bluesky_handle,
              onChange: (e) => setData(
                "bluesky_handle",
                e.target.value
              ),
              error: errors.bluesky_handle
            }
          ),
          /* @__PURE__ */ jsx(
            PasswordInput,
            {
              label: "App Password",
              placeholder: "Enter your Bluesky app password",
              value: data.bluesky_app_password,
              onChange: (e) => setData(
                "bluesky_app_password",
                e.target.value
              ),
              error: errors.bluesky_app_password
            }
          ),
          /* @__PURE__ */ jsx(
            Button,
            {
              type: "submit",
              loading: processing,
              children: "Save Bluesky Settings"
            }
          )
        ] }) }) }) })
      ] })
    ] }) }) })
  ] });
}
export {
  SettingsIndex as default
};
