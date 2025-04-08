return {
  {
    "neovim/nvim-lspconfig",
    opts = function(_, opts)
      local configs = require("lspconfig.configs")

      if not configs.livelove then
        configs.livelove = {
          default_config = {
            cmd = { "node", vim.fn.expand("~/workspace/livelaughlove/livelove-lsp/out/server.js"), "--stdio" },
            filetypes = { "lua" },
            root_dir = function(fname)
              return vim.loop.cwd()
            end,
            settings = {},
          },
        }
      end

      opts.servers = opts.servers or {}
      opts.servers.livelove = {
        -- Enable inlay hints by default
        on_attach = function(client, bufnr)
          vim.lsp.set_log_level("debug")
          if client.server_capabilities.inlayHintProvider then
            -- Try with true first
            pcall(function()
              vim.lsp.inlay_hint.enable(true, { bufnr = 0 })
            end)
          end
        end,

        capabilities = {
          textDocumentSync = {
            change = 2, -- Incremental
            openClose = true,
          },
          inlayHintProvider = true,
          codeActionProvider = {
            resolveProvider = true,
          },
        },

        handlers = {
          ["textDocument/inlayHint"] = vim.lsp.handlers["textDocument/inlayHint"],

          ["$/refreshInlayHints"] = function(_, result, ctx)
            local bufnr = vim.uri_to_bufnr(result.uri)
            if vim.api.nvim_buf_is_valid(bufnr) then
              vim.lsp.inlay_hint.enable(true)
            end
          end,
        },
      }

      return opts
    end,
  },
}
