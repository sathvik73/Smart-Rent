pragma solidity ^0.5.0;

contract MoneyManagement {
    address payable public owner;

    struct Location {
        string name; // location name or address
        uint monthlyRent; // in wei
        address payable tenant; // zero if unassigned
        bool ownerSigned; // owner has approved
        bool tenantSigned; // tenant has signed
        uint lastPaid; // timestamp of last payment
        bool active;
    }

    Location[] public locations;

    event LocationCreated(uint indexed id, string name, uint monthlyRent);
    event LocationAssigned(uint indexed id, address tenant);
    event LocationOwnerApproved(uint indexed id);
    event LocationTenantSigned(uint indexed id, address tenant);
    event LocationTerminated(uint indexed id);
    event RentPaid(uint indexed id, address indexed tenant, uint amount, uint timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() public {
        owner = msg.sender;
    }

    // Owner creates a new location listing
    function createLocation(string memory name, uint monthlyRent) public onlyOwner {
        Location memory loc = Location({name: name, monthlyRent: monthlyRent, tenant: address(0), ownerSigned: true, tenantSigned: false, lastPaid: 0, active: true});
        locations.push(loc);
        emit LocationCreated(locations.length - 1, name, monthlyRent);
    }

    // Owner assigns a tenant to a location (optional)
    function assignTenant(uint id, address payable tenant) public onlyOwner {
        require(id < locations.length, "Invalid id");
        Location storage loc = locations[id];
        require(loc.active, "Location not active");
        loc.tenant = tenant;
        emit LocationAssigned(id, tenant);
    }

    // Owner approves a location (ownerSigned true)
    function ownerApprove(uint id) public onlyOwner {
        require(id < locations.length, "Invalid id");
        Location storage loc = locations[id];
        loc.ownerSigned = true;
        emit LocationOwnerApproved(id);
    }

    // Tenant signs the contract for a location
    function tenantSign(uint id) public {
        require(id < locations.length, "Invalid id");
        Location storage loc = locations[id];
        require(loc.active, "Location not active");
        require(loc.tenant == address(0) || loc.tenant == msg.sender, "Location assigned to another tenant");
        loc.tenant = address(uint160(msg.sender));
        loc.tenantSigned = true;
        emit LocationTenantSigned(id, msg.sender);
    }

    // Tenant pays rent for a location (requires tenantSigned && ownerSigned)
    function payRent(uint id) public payable {
        require(id < locations.length, "Invalid id");
        Location storage loc = locations[id];
        require(loc.active, "Location not active");
        require(loc.tenant == msg.sender, "Only assigned tenant can pay");
        require(loc.ownerSigned && loc.tenantSigned, "Contract not fully signed");
        require(msg.value >= loc.monthlyRent, "Insufficient payment");
        // transfer to owner
        owner.transfer(msg.value);
        loc.lastPaid = now;
        emit RentPaid(id, msg.sender, msg.value, now);
    }

    // Owner can terminate the location (deactivate)
    function terminateLocation(uint id) public onlyOwner {
        require(id < locations.length, "Invalid id");
        Location storage loc = locations[id];
        loc.active = false;
        emit LocationTerminated(id);
    }

    // Get number of locations
    function getLocationCount() public view returns (uint) {
        return locations.length;
    }

    // Returns: name, monthlyRent, tenant, ownerSigned, tenantSigned, lastPaid, active
    function getLocation(uint id) public view returns (string memory, uint, address, bool, bool, uint, bool) {
        require(id < locations.length, "Invalid id");
        Location storage loc = locations[id];
        return (loc.name, loc.monthlyRent, loc.tenant, loc.ownerSigned, loc.tenantSigned, loc.lastPaid, loc.active);
    }
}
