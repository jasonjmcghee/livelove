# livelove

_This is an old project that I'm open sourcing at the request of a few folks - please feel free to file any issues you have._

A LÖVE 2D VSCode extension [./livelove-lsp](./livelove-lsp) in the form of an LSP server, and a few files to add to your project to enable live coding, and live feedback.

# Getting Started

1. Install the vs code extension. (You can build it yourself, or [download the one I built here](https://github.com/jasonjmcghee/livelove/releases/).)
2. Add the `.lua` files other than `main.lua` to your project (`color.lua` is optional).
3. As soon as you open a file like `main.lua` after installing the extension, it will automatically start. Just run the project, and you should see inlay hints. Edit your file and see the changes instantly (glsl shaders work too)!

Note: if you'd rather not see inlay hints, you can just disable `live_vars` at the top of `livelove.lua`.

![image](https://github.com/user-attachments/assets/3553a8ba-2bc7-4140-bf1f-1178079a70f2)

There are a few additional features included. You can select a hex color string or a number, then click once on it. It'll pop up a slider / color palette (click to modify) you can use to edit the values using a good UX, live.

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
