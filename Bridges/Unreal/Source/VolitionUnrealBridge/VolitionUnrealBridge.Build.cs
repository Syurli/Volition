using UnrealBuildTool;

public class VolitionUnrealBridge : ModuleRules
{
    public VolitionUnrealBridge(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new[]
        {
            "Core",
            "CoreUObject",
            "Engine"
        });
    }
}
