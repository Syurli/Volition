using UnrealBuildTool;

public class VolitionEditor : ModuleRules
{
    public VolitionEditor(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PrivateDependencyModuleNames.AddRange(
            new string[]
            {
                "Core",
                "CoreUObject",
                "Engine",
                "UnrealEd",
                "VolitionCore",
                "VolitionRuntime"
            }
        );
    }
}
