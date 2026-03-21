#include <iostream>
#include <string>
#include <vector>

#include "bridge/BridgeJson.h"
#include "bridge/RuntimeBridge.h"

namespace {

std::string NormalizeProtocolLine(std::string value)
{
    for (char& ch : value) {
        if (ch == '\r' || ch == '\n') {
            ch = ' ';
        }
    }

    return value;
}

void WriteSessionResponse(const std::string& status, const std::string& payload)
{
    std::cout << status << '\n' << NormalizeProtocolLine(payload) << '\n' << std::flush;
}

std::string ExecuteRequest(bridge::RuntimeBridge& runtime_bridge, const bridge::BridgeRequest& request)
{
    if (request.operation == bridge::BridgeOperation::InvokeMethod) {
        return bridge::SerializeResponse(runtime_bridge.ExecuteInvoke(request));
    }
    if (request.operation == bridge::BridgeOperation::SetField) {
        return bridge::SerializeResponse(runtime_bridge.ExecuteSetField(request));
    }
    return bridge::SerializeResponse(runtime_bridge.Execute(request));
}

int RunSessionMode()
{
    bridge::RuntimeBridge runtime_bridge;
    std::string line;

    while (std::getline(std::cin, line)) {
        if (line == "QUIT") {
            return 0;
        }

        try {
            if (line != "REQ") {
                throw std::runtime_error("Invalid session request preamble");
            }

            if (!std::getline(std::cin, line)) {
                throw std::runtime_error("Missing session argument count");
            }

            const auto count = static_cast<std::size_t>(std::stoull(line));
            std::vector<std::string> args;
            args.reserve(count);
            for (std::size_t index = 0; index < count; ++index) {
                if (!std::getline(std::cin, line)) {
                    throw std::runtime_error("Unexpected end of session request");
                }
                args.push_back(line);
            }

            const auto request = bridge::ArgumentParser::Parse(args);
            WriteSessionResponse("OK", ExecuteRequest(runtime_bridge, request));
        }
        catch (const std::exception& error) {
            WriteSessionResponse("ERR", error.what());
        }
    }

    return 0;
}

}

int main(int argc, char* argv[])
{
    try {
        if (argc == 2 && std::string(argv[1]) == "--session") {
            return RunSessionMode();
        }

        const auto request = bridge::ArgumentParser::Parse(argc, argv);
        const bridge::RuntimeBridge runtime_bridge;
        std::cout << ExecuteRequest(const_cast<bridge::RuntimeBridge&>(runtime_bridge), request);
        return 0;
    }
    catch (const std::exception& error) {
        std::cerr << error.what();
        return 10;
    }
}
