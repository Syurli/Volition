using UnrealBuildTool;

public class WillformUnrealEditor : ModuleRules
{
    public WillformUnrealEditor(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PrivateDependencyModuleNames.AddRange(new[]
        {
            "Core",
            "Projects",
            "UnrealEd",
            "WillformUnrealBridge"
        });
    }
}
