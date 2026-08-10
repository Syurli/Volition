using UnrealBuildTool;

public class VolitionRuntime : ModuleRules
{
    public VolitionRuntime(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(
            new string[]
            {
                "Core",
                "CoreUObject",
                "Engine",
                "VolitionCore"
            }
        );
    }
}
