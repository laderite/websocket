if getgenv().WS then
	getgenv().WS:Close()
	getgenv().WS = nil
end

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local MarketplaceService = game:GetService("MarketplaceService")
local RunService = game:GetService("RunService")
local Stats = game:GetService("Stats")

if not websocket then return end

-- Attempt to connect to the WebSocket server
local success, WS = pcall(websocket.connect, "ws://localhost:3000")
if not success then
	print("Failed to connect to WebSocket server:", WS)
	return
end
getgenv().WS = WS

-- Collect client information
local jobId = game.JobId
local userId = Players.LocalPlayer.UserId
local username = Players.LocalPlayer.Name

-- Get game name using MarketplaceService
local gameName = "Unknown Game"
pcall(function()
	local placeId = game.PlaceId
	local success, info = pcall(function()
		return MarketplaceService:GetProductInfo(placeId)
	end)
	if success and info then
		gameName = info.Name
	end
end)

-- Send registration message with all required information
local registrationMessage = HttpService:JSONEncode({
	action = "register",
	jobId = jobId,
	userId = userId,
	username = username,
	gameName = gameName,
})
WS:Send(registrationMessage)

local clientId
local initialized = false

local commandHandlers = {
	kick = function(params)
		Players.LocalPlayer:Kick(params.message or "You have been kicked")
	end,
	message = function(params)
		print(params.message or "No message provided")
	end,
}

-- Handle incoming messages from the server
WS.OnMessage:Connect(function(message)
	local success, data = pcall(HttpService.JSONDecode, HttpService, message)
	if not success then
		print("Failed to parse JSON:", message)
		return
	end

	if data.action == "assignId" then
		clientId = data.id
		print("Assigned Client ID:", clientId)
		initialized = true
	elseif data.action == "command" and initialized then
		local handler = commandHandlers[data.command]
		if handler then
			handler(data.params or {})
		else
			print("Unknown command received:", data.command)
		end
	else
		if not initialized then
			print("Ignored message before initialization:", HttpService:JSONEncode(data))
		end
	end
end)

WS.OnClose:Connect(function()
	print("WebSocket connection closed")
end)
