// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

//TODO: check how matic Oracle works
contract MaticPriceAggregatorV3Mock {
   int256 price = 36662934;
  function decimals() public view returns (uint8) {
     return 8;
  }

  function description() external view returns (string memory) {
     return "MATIC -> USD Mock";
  }

  function version() external view returns (uint256) {
     return 3;
  }

  // getRoundData and latestRoundData should both raise "No data present"
  // if they do not have data to report, instead of returning unset values
  // which could be misinterpreted as actual reported values.
  function getRoundData(uint80 _roundId)
    external
    view
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    ) {
       uint80 safeBlockNumber = uint80(block.number % type(uint80).max);
       return (
          safeBlockNumber,
          price,
          block.timestamp,
          block.timestamp,
          safeBlockNumber
       );
    }

  function latestRoundData()
    public
    view
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    ) {
       uint80 safeBlockNumber = uint80(block.number % type(uint80).max);
       return (
          safeBlockNumber,
          price,
          block.timestamp,
          block.timestamp,
          safeBlockNumber
       );
    }

   function setPrice(int256 _price) external {
      price = _price;
   }

    function dollarToWei() external view returns (uint256) {
        (,int256 maticPrice,,,) = latestRoundData();
        require (maticPrice > 0, "Unable to retrieve MATIC price.");

        uint256 maticPriceMultiplier = 10**decimals();

        return(10**18 * maticPriceMultiplier) / uint256(maticPrice);
    }
}