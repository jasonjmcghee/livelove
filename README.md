# livelove

_Please feel free to file any issues you have._

A LÖVE 2D [VSCode extension](./livelove-lsp) in the form of an LSP server, and a few files to add to your project to enable live coding, and live feedback.

_Note: I also added [a neovim plugin](./livelove-nvim), if you'd prefer neovim over vs code. It does not support the live number slider and live color palette features, but does support live coding and live feedback._

"Live coding" here means, when you change the code, you'll see the changes reflected instantly / as you type them. If there are errors, it'll use the last valid code.

"Live feedback" here means, you'll see every value of variables you created, updated live, next to any reference to it (as an inlay hint). Any variable prefixed with `_` like `_foo` will not be tracked. You can disable this entirely with `live_vars = false` at the top of `livelove.lua`.

# Getting Started

1. Install the vs code extension. (You can build it yourself, or [download the one I built here](https://github.com/jasonjmcghee/livelove/releases/).) or install the neovim plugin (`cd` into the folder and run `npm run install`).
2. Add the `.lua` files other than `main.lua` to your project (`color.lua` is optional).
3. As soon as you open a file like `main.lua` after installing the extension, it will automatically start the LSP. Then, just run the project / main.lua, and you should see inlay hints in the editor. Edit your file and see the changes instantly (glsl shaders work too)!

![image](https://github.com/user-attachments/assets/3553a8ba-2bc7-4140-bf1f-1178079a70f2)

There are a few additional features included. You can select a hex color string or a number, then click once on it. It'll pop up a slider / color palette (click to modify) you can use to edit the values using a good UX, live.

# Neovim Demo

https://github.com/user-attachments/assets/ce749695-4abf-48fd-ba25-3c1076ce9bb7

# Example

I've included [`main.lua`](./main.lua) to provide an example of how to use it.

But, here's a template:

```lua
if not IMAIN then
    livelove = require("livelove")
    -- Add state that you want to persist across hot reload here (probably most everything)
    -- You'll want something like this in every file, but choose a unique variable each time.
    IMAIN = true
end

local function hotreload()
    -- (optional) whatever you want here (fires any time there's a hot reload)
end

livelove.postswap = function(f)
    hotreload()
end

function love.update(dt)
    livelove.instantupdate()
    -- whatever you want here
end

function love.draw()
    -- whatever you want here
    livelove.postdraw()
end
```
