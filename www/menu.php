<?php

$menu = array(

    // Featured tools (add star icons + highlight)
    "dynamic_heatpump" => array(
        "category" => "Featured",
        "case" => "dynamic_heatpump",
        "title" => "Dynamic heat pump simulator",
        "description" => "Explore continuous vs intermittent heating, temperature set-backs and schedules",
        "standalone" => true
    ),
    "cobenefit_explorer" => array(
        "category" => "Featured",
        "case" => "cobenefit_explorer",
        "title" => "Household Co-benefit Explorer",
        "description" => "Start from the fossil status quo and switch on solar, battery, heat pump and EV in any order. Running costs, asset replacement and carbon are tracked together, over a half-hourly simulation of a real year.",
        "standalone" => true
    ),
    "ukgridsim" => array(
        "category" => "Featured",
        "case" => "UKGridSim",
        "title" => "UK Grid Simulator",
        "description" => "Can you match supply and demand on the UK grid?"
    ),

    // Mini tools
    "simpleheatloss" => array(
        "category" => "Mini tools",
        "case" => "SimpleHeatLoss",
        "title" => "Super Simple Heat Loss",
        "description" => "Explore the difference between custom measured assumptions and those typically used from the CIBSE domestic heating design guide."
    ),
    "weathercomp" => array(
        "category" => "Mini tools",
        "case" => "weathercomp",
        "title" => "Weather Compensation",
        "description" => "Calculate optimum weather compensation settings for a heat pump"
    ),
    "radschedule" => array(
        "category" => "Mini tools",
        "case" => "RadSchedule",
        "title" => "Radiator Schedule",
        "description" => "Calculate radiator heat output"
    ),
    "radequation" => array(
        "category" => "Mini tools",
        "case" => "RadEquation",
        "title" => "Radiator Equation",
        "description" => "Calculate radiator heat output"
    ),
    "hex1" => array(
        "category" => "Mini tools",
        "case" => "HEX1",
        "title" => "Plate heat exchanger, fixed flow temperature",
        "description" => "Calculate heat output and COP for a system with a counterflow plate heat exchanger between the heat pump and the radiator system. Fixed flow temperature version."
    ),
    "hex2" => array(
        "category" => "Mini tools",
        "case" => "HEX2",
        "title" => "Plate heat exchanger, fixed heat transfer",
        "description" => "Calculate heat output and COP for a system with a counterflow plate heat exchanger between the heat pump and the radiator system. Improved fixed heat output version."
    ),
    "llh" => array(
        "category" => "Mini tools",
        "case" => "llh",
        "title" => "Low loss header",
        "description" => "Calculate heat output and COP for a system with a low loss header between the heat pump and the radiator system",
    ),
    "pressureloss" => array(
        "category" => "Mini tools",
        "case" => "PressureLoss",
        "title" => "Pipe pressure loss calculator",
        "description" => "Calculates pressure loss using the Darcy Weisbach equation with the friction factor derived using the Newton-Raphson method to solve the Colebrook-White equation."
    ),

    // Misc
    "vaillant_cop_model" => array(
        "category" => "Misc",
        "case" => "vaillant_cop_model",
        "title" => "Vaillant COP model",
        "description" => "Explore if a simple model can reproduce the vaillant COP datasheet"
    ),
    "volume_sim" => array(
        "category" => "Misc",
        "case" => "volume_sim",
        "title" => "Volume Simulator",
        "description" => "Explore system volume, starts per hour and cycling"
    ),
    "volume_sim_cop" => array(
        "category" => "Misc",
        "case" => "volume_sim_cop",
        "title" => "Volume simulator with heat pump COP",
        "description" => "Explore heat pump minimum modulation and cycling's effect of COP"
    ),
    "volume_sim_cop2" => array(
        "category" => "Misc",
        "case" => "volume_sim_cop2",
        "title" => "Volume simulator with heat pump COP and calculated radiator volume.",
        "description" => "Explore heat pump minimum modulation and cycling's effect of COP (3.7 L/kW of K2 rad)"
    ),
    "co2_sim" => array(
        "category" => "Misc",
        "case" => "co2_sim",
        "title" => "Building indoor CO2 simulator",
        "description" => "Explore effect of building occupancy & air change rate on indoor CO2 concentrations."
    ),
    "storagesimulator" => array(
        "category" => "Misc",
        "case" => "StorageSimulator",
        "title" => "Storage simulator",
        "description" => "Explore how much home electric + heat pump demand can be met by different mixes of wind, solar, nuclear, battery storage, long duration energy storage or other final backup supply."
    ),
    "dynamic_uvalues" => array(
        "category" => "Misc",
        "case" => "dynamic_uvalues",
        "title" => "Dynamic U-values",
        "description" => "Explore time-varying U-value of a solid stone wall"
    ),


    // Reference
    "mis031" => array(
        "category" => "Reference",
        "case" => "MIS031",
        "title" => "MIS031: Heat Pump System Performance Estimate",
        "description" => ""
    ),
    "ventilation_12831" => array(
        "category" => "Reference",
        "case" => "ventilation_12831",
        "title" => "EN12831 Ventilation",
        "description" => "EN12831 Reference Ventilation Calculation"
    ),
    "lcoe" => array(
        "category" => "Reference",
        "case" => "LCOE",
        "title" => "LCOE",
        "description" => "Levelised Cost of Energy Calculator"
    )
);

// Additional pages, keyed by the url path they are reached at
// e.g. /dynamic_heatpump/docs/frost
// Each is a complete standalone html file served as is by the front
// controller, paths inside the file stay relative to the file's own location.
$pages = array(
    "dynamic_heatpump/docs/frost" => array(
        "file" => "tools/dynamic_heatpump/docs/frost.php",
        "title" => "How the frost & defrost model works",
        "description" => "An illustrated tutorial on the evaporator frosting and reverse-cycle defrost model used by the dynamic heat pump simulator."
    )
);
