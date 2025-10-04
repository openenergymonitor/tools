<?php

$menu = array(
    "simpleheatloss" => array(
        "category" => "Heat Loss",
        "case" => "SimpleHeatLoss",
        "title" => "Super Simple Heat Loss",
        "description" => "Explore the difference between custom measured assumptions and those typically used from the CIBSE domestic heating design guide."
    ),
    "weathercomp" => array(
        "case" => "WeatherComp",
        "title" => "Weather Compensation",
        "description" => "Calculate optimum weather compensation settings for a heat pump"
    ),
    "scop" => array(
        "category" => "Performance Calculation",
        "case" => "SCOP",
        "title" => "Heat Pump System Performance Calculator",
        "description" => "Calculate heat pump SCOP based on design flow temperature"
    ),
    "radschedule" => array(
        "category" => "Heat Loss",
        "case" => "RadSchedule",
        "title" => "Radiator Schedule",
        "description" => "Calculate radiator heat output"
    ),
    "radequation" => array(
        "category" => "Heat Loss",
        "case" => "RadEquation",
        "title" => "Radiator Equation",
        "description" => "Calculate radiator heat output"
    ),
    "dynamic_heatpump_v1" => array(
        "category" => "Dynamic Simulation",
        "case" => "dynamic_heatpump_v1",
        "title" => "Dynamic heat pump simulator",
        "description" => "Explore continuous vs intermittent heating, temperature set-backs and schedules"
    ),
    "vaillant_cop_model" => array(
        "category" => "Vaillant COP model",
        "case" => "vaillant_cop_model",
        "title" => "Vaillant COP model",
        "description" => "Explore if a simple model can reproduce the vaillant COP datasheet"
    ),
    "solarmatching" => array(
        "category" => "Electric Supply",
        "case" => "SolarMatching",
        "title" => "Explore Solar Matching",
        "description" => "Explore how much home electric + heat pump demand can be met by solar and a battery"
    ),
    "hex1" => array(
        "category" => "Hydraulic Separation",
        "case" => "HEX1",
        "title" => "Plate heat exchanger, fixed flow temperature",
        "description" => "Calculate heat output and COP for a system with a counterflow plate heat exchanger between the heat pump and the radiator system. Fixed flow temperature version."
    ),
    "hex2" => array(
        "category" => "Hydraulic Separation",
        "case" => "HEX2",
        "title" => "Plate heat exchanger, fixed heat transfer",
        "description" => "Calculate heat output and COP for a system with a counterflow plate heat exchanger between the heat pump and the radiator system. Improved fixed heat output version."
    ),
    "llh" => array(
        "category" => "Hydraulic Separation",
        "case" => "llh",
        "title" => "Low loss header",
        "description" => "Calculate heat output and COP for a system with a low loss header between the heat pump and the radiator system",
    ),
    "volume_sim" => array(
        "category" => "Dynamic Simulation",
        "case" => "volume_sim",
        "title" => "Volume Simulator",
        "description" => "Explore system volume, starts per hour and cycling"
    ),
    "volume_sim_cop" => array(
        "category" => "Dynamic Simulation",
        "case" => "volume_sim_cop",
        "title" => "Volume simulator with heat pump COP",
        "description" => "Explore heat pump minimum modulation and cycling's effect of COP"
    ),
    "volume_sim_cop2" => array(
        "category" => "Dynamic Simulation",
        "case" => "volume_sim_cop2",
        "title" => "Volume simulator with heat pump COP and calculated radiator volume.",
        "description" => "Explore heat pump minimum modulation and cycling's effect of COP (3.7 L/kW of K2 rad)"
    ),
    "pressureloss" => array(
        "case" => "PressureLoss",
        "title" => "Pipe pressure loss calculator",
        "description" => "Calculates pressure loss using the Darcy Weisbach equation with the friction factor derived using the Newton-Raphson method to solve the Colebrook-White equation."
    ),
    "mis031" => array(
        "category" => "Performance Calculation",
        "case" => "MIS031",
        "title" => "MIS031: Heat Pump System Performance Estimate",
        "description" => ""
    ),
    "co2_sim" => array(
        "case" => "co2_sim",
        "title" => "Building indoor CO2 simulator",
        "description" => "Explore effect of building occupancy & air change rate on indoor CO2 concentrations."
    ),
    "storagesimulator" => array(
        "category" => "Electric Supply",
        "case" => "StorageSimulator",
        "title" => "Storage simulator",
        "description" => "Explore how much home electric + heat pump demand can be met by different mixes of wind, solar, nuclear, battery storage, long duration energy storage or other final backup supply."
    ),
    "ukgridsim" => array(
        "category" => "Electric Supply",
        "case" => "UKGridSim",
        "title" => "UK Grid Simulator",
        "description" => "Can you match supply and demand on the UK grid?"
    ),
    "dynamic_uvalues" => array(
        "category" => "Dynamic Simulation",
        "case" => "dynamic_uvalues",
        "title" => "Dynamic U-values",
        "description" => "Explore time-varying U-value of a solid stone wall"
    ),
    "ventilation_12831" => array(
        "category" => "Heat Loss",
        "case" => "ventilation_12831",
        "title" => "EN12831 Ventilation",
        "description" => "EN12831 Reference Ventilation Calculation"
    ),
    "lcoe" => array(
        "case" => "LCOE",
        "title" => "LCOE",
        "description" => "LCOE",
        "hide" => true
    ),
    "lcoe_simple" => array(
        "case" => "LCOE_Simple",
        "title" => "LCOE Simple",
        "description" => "LCOE ...",
        "hide" => true
    ),
);
