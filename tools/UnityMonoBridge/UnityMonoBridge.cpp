#include <iostream>
#include "bridge/BridgeJson.h"
#include "bridge/RuntimeBridge.h"

int main(int argc, char* argv[])
{
    try {
        const auto request = bridge::ArgumentParser::Parse(argc, argv);
        const bridge::RuntimeBridge runtime_bridge;
        const auto response = runtime_bridge.Execute(request);
        std::cout << bridge::SerializeResponse(response);
        return 0;
    }
    catch (const std::exception& error) {
        std::cerr << error.what();
        return 10;
    }
}
