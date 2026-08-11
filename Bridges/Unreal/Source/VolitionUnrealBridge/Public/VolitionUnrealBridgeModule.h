#pragma once

#include "Modules/ModuleManager.h"

class FVolitionUnrealBridgeModule final : public IModuleInterface
{
public:
    virtual void StartupModule() override;
    virtual void ShutdownModule() override;
};
