var MyContract = artifacts.require("./MoneyManagement.sol");

module.exports = function(deployer) {
  deployer.deploy(MyContract);
};