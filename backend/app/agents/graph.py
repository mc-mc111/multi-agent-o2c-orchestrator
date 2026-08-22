import logging
from typing import Dict, Any, Literal
from langgraph.graph import StateGraph, END
from app.agents.state import O2CState
from app.agents.nodes import validation_node, inventory_node, billing_node, risk_node

logger = logging.getLogger("graph")

# Conditional Router after Validation Agent
def route_after_validation(state: O2CState) -> Literal["inventory", "__end__"]:
    if state.get("validation_status") == "VALIDATED":
        return "inventory"
    return END

# Conditional Router after Inventory Agent
def route_after_inventory(state: O2CState) -> Literal["billing", "__end__"]:
    if state.get("inventory_status") == "INVENTORY_RESERVED":
        return "billing"
    # If INVENTORY_EXCEPTION, pause state machine for human-in-the-loop input via SSE/resume API
    return END

def create_o2c_graph():
    builder = StateGraph(O2CState)
    
    # Add Agent Nodes
    builder.add_node("validation", validation_node)
    builder.add_node("inventory", inventory_node)
    builder.add_node("billing", billing_node)
    builder.add_node("risk", risk_node)
    
    # Set Entry Point
    builder.set_entry_point("validation")
    
    # Add Edges & Conditional Routing
    builder.add_conditional_edges("validation", route_after_validation)
    builder.add_conditional_edges("inventory", route_after_inventory)
    builder.add_edge("billing", "risk")
    builder.add_edge("risk", END)
    
    return builder.compile()

o2c_graph = create_o2c_graph()
