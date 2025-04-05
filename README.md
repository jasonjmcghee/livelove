# livelove

_This is an old project that I've open sourcing at the request of a few folks - please feel free to file any issues you have._

A LÖVE 2D VSCode extension [./livelove-lsp](./livelove-lsp) in the form of an LSP server, and a few files to add to your project to enable live coding, and live feedback.

# Getting Started

1. Install the vs code extension. (You can build it yourself, or [download the one I built here](https://github.com/jasonjmcghee/livelove/releases/).)
2. Add the files other than `main.lua` to your project.
3. Launch the VSCode extension by running the command "

# Example

I've included [`main.lua`](./main.lua) to provide an example of how to use it.

But, here's a template:

```lua
if not IMAIN then
    livelove = require("livelove")
    -- Add state that you want to persist across hot reload here (probably most everything)
    IMAIN = true
end

local function hotreload()
    -- whatever you want here (fires any time there's a hot reload)
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