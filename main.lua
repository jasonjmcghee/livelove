if not IMAIN then
    livelove = require("livelove")
    -- State variables
    particles = {}
    maxParticles = 500
    spawnRate = 10
    spawnTimer = 0
    mouseX, mouseY = 0, 0
    colorCycle = 0
    -- Add timer for tracking time since last hotreload!
    lastHotreloadTime = 0
    IMAIN = true
end

local function hotreload()
    -- Reset the hotreload timer.
    lastHotreloadTime = 0
end

livelove.postswap = function(f)
    hotreload()
end

foo = 0

local function createParticle()
    local angle = love.math.random() * math.pi * 2
    local distance = love.math.random(50, 150)
    local speed = love.math.random(20, 80)
    
    return {
        x = mouseX,
        y = mouseY,
        vx = math.cos(angle) * speed,
        vy = math.sin(angle) * speed,
        radius = love.math.random(2, 8),
        color = {
            r = 0.5 + 0.5 * math.sin(colorCycle),
            g = 0.5 + 0.5 * math.sin(colorCycle + math.pi * 2/3),
            b = 0.5 + 0.5 * math.sin(colorCycle + math.pi * 4/3),
            a = 1
        },
        life = love.math.random(1, 3),
        gravity = love.math.random(50, 150)
    }
end

function love.update(dt)
    livelove.instantupdate()
    
    -- Update hotreload timer
    lastHotreloadTime = lastHotreloadTime + dt
    
    -- Get mouse position
    mouseX, mouseY = love.mouse.getPosition()
    
    -- Update color cycle!
    colorCycle = colorCycle + dt * 0.5
    
    -- Spawn new particles
    spawnTimer = spawnTimer + dt
    local particlesToSpawn = math.floor(spawnTimer * spawnRate)
    if particlesToSpawn > 0 and #particles < maxParticles then
        spawnTimer = spawnTimer - particlesToSpawn / spawnRate
        for i = 1, math.min(particlesToSpawn, maxParticles - #particles) do
            table.insert(particles, createParticle())
        end
    end
    
    -- Update existing particles
    for i = #particles, 1, -1 do
        local p = particles[i]
        
        -- Update position
        p.x = p.x + p.vx * dt
        p.y = p.y + p.vy * dt
        
        -- Apply gravity toward mouse
        local dx = mouseX - p.x
        local dy = mouseY - p.y
        local distSq = dx * dx + dy * dy
        local dist = math.sqrt(distSq)
        
        if dist > 0 then
            local force = p.gravity / dist
            p.vx = p.vx + dx / dist * force * dt
            p.vy = p.vy + dy / dist * force * dt
        end
        
        -- Apply drag
        p.vx = p.vx * 0.98
        p.vy = p.vy * 0.98
        
        -- Update life
        p.life = p.life - dt
        p.color.a = math.min(1, p.life)
        
        -- Remove dead particles
        if p.life <= 0 then
            table.remove(particles, i)
        end
    end

    foo = foo + 1
end

function love.draw()
    -- Clear screen with a dark background
    love.graphics.clear(0.1, 0.1, 0.15)
    
    -- Draw particles
    for _, p in ipairs(particles) do
        love.graphics.setColor(p.color.r, p.color.g, p.color.b, p.color.a)
        love.graphics.circle("fill", p.x, p.y, p.radius)
    end
    
    -- Draw information text
    love.graphics.setColor(1, 1, 1, 0.7)
    love.graphics.print("Interactive Particle System - " .. #particles .. " particles", 10, 10)
    love.graphics.print("Move your mouse to control the particles", 10, 30)
    
    -- Format and display the time since last hotreload
    local seconds = math.floor(lastHotreloadTime % 60)
    local minutes = math.floor(lastHotreloadTime / 60) % 60
    local hours = math.floor(lastHotreloadTime / 3600)
    local timeString = string.format("Time since last hotreload: %02d:%02d:%02d", hours, minutes, seconds)
    love.graphics.print(timeString, 10, 50)
    
    -- livelove
    livelove.postdraw()
end