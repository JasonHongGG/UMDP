#pragma once

#include <string>

#include "bridge/BridgeModels.h"

namespace bridge {

std::string SerializeResponse(const RuntimeClassOverlayResponse& response);
std::string SerializeResponse(const RuntimeMethodInvokeResponse& response);
std::string SerializeResponse(const RuntimeFieldSetResponse& response);
std::string SerializeResponse(const SceneCatalogResponse& response);
std::string SerializeResponse(const SceneChildrenResponse& response);
std::string SerializeResponse(const SceneChildrenPageResponse& response);
std::string SerializeResponse(const SceneComponentsPageResponse& response);
std::string SerializeResponse(const SceneObjectInspectorHeaderResponse& response);
std::string SerializeResponse(const SceneObjectInspectorResponse& response);
std::string SerializeResponse(const SceneMutationResponse& response);

} // namespace bridge