using UnrealBuildTool;

public class VolitionUnrealEditor : ModuleRules
{
    public VolitionUnrealEditor(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PrivateDependencyModuleNames.AddRange(new[]
        {
            "Core",
            "Projects",
            "UnrealEd",
            "VolitionUnrealBridge"
        });
    }
}
